import { ref, watch } from 'vue'
import { baseApi } from '../api-env'
import { localMediaPath, readLocalBlob } from './media'
import { pendingNote, pendingNotes, restorePendingNotes, writePendingNote, type PendingNote } from './pending-notes'
import { ApiError, cacheSyncedDeletion, cacheSyncedNote, clearSession, refreshActiveScope, registerBeforePull, request, useBookStore } from './store'
import { parseContent, stringifyContent, type BookNode, type NodeContent, type NoteBlock } from './types'
import { importCover, newId, submitNode } from './use-book'

const store = useBookStore()
export const noteSyncRunning = ref(false)
export const noteSyncOffline = ref(false)
export const uploadProgress = ref({ total: 0, completed: 0, failed: 0 })
let activeUpload: Promise<void> | undefined
const acknowledged = new Map<string, { revision: string; version?: number }>()
let started = false
let timer: ReturnType<typeof setTimeout> | undefined

/** 先落本机，页面无需等待网络。编辑基线仅随本机已确认的写入推进。 */
export function queueNote(owner: string, node: BookNode, lastRevision?: string) {
  if (!owner || owner !== store.account.value || !store.token.value) throw new Error('登录账号已变化')
  const previous = pendingNote(owner, node.id)
  const saved = acknowledged.get(owner + ':' + node.id)
  const version = previous ? previous.node.version
    : saved && saved.revision === lastRevision ? saved.version : node.version
  const revision = newId()
  writePendingNote(owner, node.id, {
    node: { ...node, version },
    revision,
    attempted: previous?.attempted,
    problem: previous?.problemCode === 409 ? previous.problem : undefined,
    problemCode: previous?.problemCode === 409 ? 409 : undefined
  })
  scheduleNoteSync()
  return revision
}

export function startNoteSync() {
  if (!started) {
    started = true
    registerBeforePull(flushPendingUploads, () => scheduleNoteSync())
    watch(store.account, () => scheduleNoteSync())
    watch(store.token, () => scheduleNoteSync())
    uni.onNetworkStatusChange(event => {
      noteSyncOffline.value = !event.isConnected
      if (event.isConnected) { scheduleNoteSync(); refreshActiveScope() }
    })
    uni.getNetworkType({
      success: result => {
        noteSyncOffline.value = result.networkType === 'none'
        if (!noteSyncOffline.value) scheduleNoteSync()
      }
    })
  }
  scheduleNoteSync()
}

export function scheduleNoteSync(delay = 0) {
  if (timer !== undefined) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = undefined
    void flushPendingUploads()
  }, delay)
}

/** 只有用户确认后才以当前云端版本重试。 */
export async function retryPendingNote(id: string) {
  const owner = store.account.value
  const entry = pendingNote(owner, id)
  if (entry?.problemCode !== 409) return
  const remote = await request<BookNode>('/book/nodes/' + id)
  if (entry.revision !== pendingNote(owner, id)?.revision) return
  writePendingNote(owner, id, {
    ...entry,
    node: { ...entry.node, version: remote.version },
    problem: undefined,
    problemCode: undefined
  })
  scheduleNoteSync()
}

const extensions: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp',
  'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/webm': 'webm', 'audio/ogg': 'ogg',
  'audio/wav': 'wav', 'audio/aac': 'aac'
}

async function upload(block: NoteBlock, owner: string, token: string) {
  const key = block.localKey
  const source: Pick<UniApp.UploadFileOption, 'files' | 'filePath'> = {}
  if (!key?.startsWith(owner + ':')) throw new ApiError('本机附件已失效', 422)
  // #ifdef H5
  const blob = await readLocalBlob(key)
  if (!blob) throw new ApiError('本机附件已失效', 422)
  const mime = blob.type.split(';', 1)[0].trim().toLowerCase()
  const extension = extensions[mime]
  if (!extension) throw new ApiError('附件格式不受支持', 422)
  source.files = [{ name: 'file', file: new File([blob], 'attachment.' + extension, { type: mime }) }]
  // #endif
  // #ifdef APP-PLUS
  source.filePath = localMediaPath(owner, key)
  if (!source.filePath) throw new ApiError('本机附件已失效', 422)
  // #endif
  if (!sameSession(owner, token)) throw new ApiError('登录账号已变化', 499)
  return new Promise<string>((resolve, reject) => uni.uploadFile({
    ...source,
    url: baseApi() + '/common/upload',
    header: { Authorization: 'Bearer ' + token },
    name: 'file',
    success(response) {
      try {
        const body = JSON.parse(response.data)
        const status = body.code || response.statusCode
        if (status === 401 && sameSession(owner, token)) clearSession()
        if (response.statusCode === 200 && status === 200 && body.url) resolve(body.url)
        else reject(new ApiError(body.msg || '附件上传失败', status))
      } catch {
        reject(new ApiError('附件上传响应无效', response.statusCode))
      }
    },
    fail: () => reject(new ApiError('附件暂未上传', 0))
  }))
}

function sameSession(owner: string, token: string) {
  return owner === store.account.value && token === store.token.value
}

function sameJson(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (Array.isArray(left)) {
    return Array.isArray(right) && left.length === right.length && left.every((value, i) => sameJson(value, right[i]))
  }
  if (!left || !right || Array.isArray(right) || typeof left !== 'object' || typeof right !== 'object') return false
  const a = left as Record<string, unknown>
  const b = right as Record<string, unknown>
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length
    && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && sameJson(a[key], b[key]))
}

/** 同步传输只发送已上传媒体地址，保留旧记录中的历史附件引用。 */
function serverContent(content: NodeContent) {
  const blocks = (content.blocks || []).map(({ localKey, path, ...block }) => block)
  const attachments = (content.attachments || []).filter(item => item.id && !item.url)
  for (const block of blocks) {
    if ((block.type === 'audio' || block.type === 'image') && block.url) {
      attachments.push({ kind: block.type, url: block.url })
    }
  }
  return stringifyContent({ ...content, blocks, attachments })
}

async function sendNote(owner: string, token: string, entry: PendingNote) {
  const { id } = entry.node
  const active = () => sameSession(owner, token) && pendingNote(owner, id)?.revision === entry.revision
  if (entry.operation === 'delete') {
    let removed: string[]
    try {
      removed = await request<string[]>('/book/nodes/' + id, 'DELETE')
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error
      removed = [id]
    }
    if (!active()) return
    await cacheSyncedDeletion(owner, removed)
    if (active()) writePendingNote(owner, id)
    return
  }
  const cover = entry.node.pendingCover
  if (cover) {
    const url = cover.localKey
      ? await upload({ id: 'cover', type: 'image', localKey: cover.localKey }, owner, token)
      : await importCover(cover.remoteUrl || '')
    if (!active()) return
    entry.node = { ...entry.node, coverKind: 'public', coverRef: url, pendingCover: undefined }
    writePendingNote(owner, id, entry)
  }
  const content = parseContent(entry.node)
  for (const block of content.blocks || []) {
    if (!block.url && block.localKey) {
      const url = await upload(block, owner, token)
      if (!active()) return
      block.url = url
      entry.node.contentJson = stringifyContent(content)
      writePendingNote(owner, id, entry)
    }
  }
  if (!active()) return
  const payload = entry.node.nodeType === 'note' ? serverContent(content) : entry.node.contentJson ?? null
  entry.attempted = true
  writePendingNote(owner, id, entry)
  let saved: BookNode
  try {
    saved = await submitNode(entry.node, payload)
  } catch (failure) {
    if (!(failure instanceof ApiError) || failure.status !== 409 || !active()) throw failure
    const remote = await request<BookNode>('/book/nodes/' + id)
    if (remote.title !== entry.node.title || (remote.parentId || null) !== (entry.node.parentId || null)
        || !sameJson(parseContent(remote), JSON.parse(payload || '{}'))) throw failure
    saved = remote
  }
  if (!sameSession(owner, token)) return
  const version = Number(saved?.version)
  if (saved?.id !== id || !Number.isSafeInteger(version) || version < 1) {
    throw new ApiError('服务端未确认本次保存', 503)
  }
  saved.version = version
  acknowledged.set(owner + ':' + id, { revision: entry.revision, version: saved.version })
  const latest = pendingNote(owner, id)
  if (!latest) return
  try { await cacheSyncedNote(owner, saved) } catch { /* 同步已成功，缓存空间不足留待下次在线刷新。 */ }
  const current = pendingNote(owner, id)
  if (!current || !sameSession(owner, token)) return
  if (current.revision === entry.revision) writePendingNote(owner, id)
  else writePendingNote(owner, id, { ...current, node: { ...current.node, version: saved.version } })
}

export function flushPendingUploads() {
  if (activeUpload) return activeUpload
  activeUpload = syncNodes().finally(() => { activeUpload = undefined })
  return activeUpload
}

async function syncNodes() {
  if (noteSyncOffline.value) return
  const owner = store.account.value
  const token = store.token.value
  if (!owner || !token || !baseApi()) return
  await restorePendingNotes(owner)
  if (!sameSession(owner, token)) return
  const queued = pendingNotes(owner).filter(item => !item.problem)
  if (!queued.length) return
  uploadProgress.value = { total: queued.length, completed: 0, failed: 0 }
  noteSyncRunning.value = true
  let retry = false
  const postponed = new Set<string>()
  try {
    while (sameSession(owner, token) && !noteSyncOffline.value) {
      const queue = pendingNotes(owner)
      const entry = queue.find(item => !item.problem && !postponed.has(item.node.id)
        && (item.operation === 'delete' || !queue.some(parent => parent.node.id === item.node.parentId && !parent.node.version)))
      if (!entry) break
      try {
        await sendNote(owner, token, entry)
        if (pendingNote(owner, entry.node.id)?.revision !== entry.revision) {
          uploadProgress.value.completed++
          uploadProgress.value.total = Math.max(uploadProgress.value.total, uploadProgress.value.completed + uploadProgress.value.failed)
        }
      } catch (failure) {
        if (!sameSession(owner, token)) break
        const latest = pendingNote(owner, entry.node.id)
        if (latest?.revision !== entry.revision) continue
        if (!(failure instanceof ApiError) || failure.status === 0 || failure.status === 429) {
          retry = true
          break
        }
        if (failure.status >= 500) {
          postponed.add(entry.node.id)
          retry = true
          continue
        }
        uploadProgress.value.failed++
        writePendingNote(owner, entry.node.id, { ...latest, problem: failure.message, problemCode: failure.status })
      }
    }
  } finally {
    noteSyncRunning.value = false
    if (!sameSession(owner, token)) scheduleNoteSync()
    else if (retry) scheduleNoteSync(30_000)
  }
}
