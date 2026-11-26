import { ref, watch } from 'vue'
import { baseApi } from '../api-env'
import { localMediaPath, readLocalBlob } from './media'
import { pendingNote, pendingNotes, writePendingNote, type PendingNote } from './pending-notes'
import { ApiError, cacheSyncedNote, clearSession, request, useBookStore } from './store'
import { parseContent, stringifyContent, type BookNode, type NodeContent, type NoteBlock } from './types'
import { newId, saveNode } from './use-book'

const store = useBookStore()
export const noteSyncRunning = ref(false)
export const noteSyncOffline = ref(false)
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
    watch(store.token, () => scheduleNoteSync())
    uni.onNetworkStatusChange(event => {
      noteSyncOffline.value = !event.isConnected
      if (event.isConnected) scheduleNoteSync()
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
    void syncNotes()
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
  const payload = serverContent(content)
  entry.attempted = true
  writePendingNote(owner, id, entry)
  let saved: BookNode
  try {
    saved = await saveNode(entry.node, payload)
  } catch (failure) {
    if (!(failure instanceof ApiError) || failure.status !== 409 || !active()) throw failure
    const remote = await request<BookNode>('/book/nodes/' + id)
    if (remote.title !== entry.node.title || remote.parentId !== entry.node.parentId
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
  try { cacheSyncedNote(owner, saved) } catch { /* 同步已成功，缓存空间不足留待下次在线刷新。 */ }
  if (latest.revision === entry.revision) writePendingNote(owner, id)
  else writePendingNote(owner, id, { ...latest, node: { ...latest.node, version: saved.version } })
}

async function syncNotes() {
  if (noteSyncRunning.value || noteSyncOffline.value) return
  const owner = store.account.value
  const token = store.token.value
  if (!owner || !token || !baseApi()) return
  noteSyncRunning.value = true
  let retry = false
  const postponed = new Set<string>()
  try {
    while (sameSession(owner, token) && !noteSyncOffline.value) {
      const entry = pendingNotes(owner).find(item => !item.problem && !postponed.has(item.node.id))
      if (!entry) break
      try {
        await sendNote(owner, token, entry)
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
        writePendingNote(owner, entry.node.id, { ...latest, problem: failure.message, problemCode: failure.status })
      }
    }
  } finally {
    noteSyncRunning.value = false
    if (!sameSession(owner, token)) scheduleNoteSync()
    else if (retry) scheduleNoteSync(30_000)
  }
}
