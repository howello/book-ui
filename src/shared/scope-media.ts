import { ref } from 'vue'
import { mediaBlob, removeMediaBlobs } from '../media-cache'
import { clearCacheRecords, listCache, readCache, writeCache } from './cache-db'
import { coverImage } from './covers'
import { parseContent, type BookNode } from './types'

interface CachedMedia { path?: string; size?: number }
export const mediaProgress = ref({ total: 0, completed: 0, failed: 0, running: false })
const jobs = new Map<string, Promise<Blob | string | undefined>>()
const queued = new Map<string, { owner: string; url: string }>()
const busyOwners = new Set<string>()
let draining = false

const prefix = (owner: string) => 'remote-media:' + owner + ':'
const safe = (url: string) => /^https?:\/\//i.test(url)

async function importRemote(owner: string, url: string) {
  const key = prefix(owner) + url
  const present = await readCache<CachedMedia>(key)
  // #ifdef H5
  if (present) {
    const blob = await mediaBlob(key)
    if (blob) return blob
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 20000)
  let blob: Blob
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) throw new Error('媒体下载失败')
    blob = await response.blob()
  } finally { clearTimeout(timeout) }
  await mediaBlob(key, blob)
  await writeCache<CachedMedia>(key, { size: blob.size })
  return blob
  // #endif
  // #ifdef APP-PLUS
  const savedPath = present?.path
  if (savedPath) {
    const exists = await new Promise<boolean>(resolve => uni.getSavedFileInfo({
      filePath: savedPath!, success: () => resolve(true), fail: () => resolve(false)
    }))
    if (exists) return savedPath
  }
  const temp = await new Promise<string>((resolve, reject) => uni.downloadFile({
    url, timeout: 20000,
    success: result => result.statusCode >= 200 && result.statusCode < 300
      ? resolve(result.tempFilePath) : reject(new Error('媒体下载失败')),
    fail: reject
  }))
  const path = await new Promise<string>((resolve, reject) => uni.saveFile({
    tempFilePath: temp, success: result => resolve(result.savedFilePath), fail: reject
  }))
  await writeCache<CachedMedia>(key, { path }).catch(async error => {
    await removeSaved(path)
    throw error
  })
  return path
  // #endif
}

function removeSaved(path: string) {
  return new Promise<void>(resolve => uni.removeSavedFile({
    filePath: path, success: () => resolve(), fail: () => resolve()
  }))
}

/** 返回已有文件，缺失时后台下载并持久化。 */
export function cacheRemoteMedia(owner: string, url: string) {
  if (!owner || !safe(url) || busyOwners.has(owner)) return Promise.resolve(undefined)
  const key = prefix(owner) + url
  const existing = jobs.get(key)
  if (existing) return existing
  const task = importRemote(owner, url).finally(() => jobs.delete(key))
  jobs.set(key, task)
  return task
}

async function drain() {
  if (draining) return
  draining = true
  mediaProgress.value.running = true
  try {
    while (queued.size) {
      const [key, job] = queued.entries().next().value!
      queued.delete(key)
      try {
        await cacheRemoteMedia(job.owner, job.url)
        mediaProgress.value.completed++
      } catch {
        mediaProgress.value.failed++
      }
    }
  } finally {
    mediaProgress.value.running = false
    draining = false
  }
}

/** 只为已访问的节点缓存封面、图片及录音。 */
export function rememberScopeMedia(owner: string, nodes: BookNode[]) {
  if (!owner || busyOwners.has(owner)) return
  if (!draining && !queued.size) mediaProgress.value = { total: 0, completed: 0, failed: 0, running: false }
  const urls = new Set<string>()
  for (const node of nodes) {
    const content = parseContent(node)
    urls.add(coverImage(node))
    for (const block of content.blocks || []) if (block.url) urls.add(block.url)
    for (const item of content.attachments || []) if (item.url) urls.add(item.url)
  }
  for (const url of urls) {
    if (!safe(url)) continue
    const key = prefix(owner) + url
    if (queued.has(key)) continue
    queued.set(key, { owner, url })
    mediaProgress.value.total++
  }
  if (queued.size) void drain()
}

export async function clearScopeMedia(owner: string) {
  busyOwners.add(owner)
  const namespace = prefix(owner)
  try {
    for (const key of queued.keys()) if (key.startsWith(namespace)) {
      queued.delete(key)
      mediaProgress.value.total--
    }
    await Promise.allSettled([...jobs.entries()].filter(([key]) => key.startsWith(namespace)).map(([, job]) => job))
    // #ifdef H5
    await removeMediaBlobs(namespace)
    // #endif
    // #ifdef APP-PLUS
    for (const [, row] of await listCache<CachedMedia>(namespace)) if (row.path) await removeSaved(row.path)
    // #endif
    await clearCacheRecords(namespace)
  } finally {
    busyOwners.delete(owner)
  }
}
