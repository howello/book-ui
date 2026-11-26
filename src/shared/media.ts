import { bookStoragePrefix } from '../api-env'
import { mediaBlob } from '../media-cache'
import { onUnmounted, reactive, watch } from 'vue'
import type { NoteBlock } from './types'

/** H5 媒体缓存键前缀，包含账号避免串号。 */
const keyPrefix = bookStoragePrefix + '-media:'

/** 生成一次性的本地媒体键。 */
export function newLocalKey(account: string) {
  return `${account}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`
}

/** H5：把原文件写入 IndexedDB，返回可跨重启使用的键。 */
export async function saveLocalBlob(key: string, blob: Blob): Promise<string> {
  await mediaBlob(key, blob)
  return key
}

/** H5：读取本地媒体 Blob。 */
export function readLocalBlob(key: string): Promise<Blob | undefined> {
  return mediaBlob(key)
}

/** 保存相册或录音的临时文件。 */
export async function keepNoteMedia(owner: string, tempPath: string): Promise<string> {
  const key = newLocalKey(owner)
  // #ifdef H5
  const response = await fetch(tempPath)
  if (!response.ok) throw new Error('无法读取附件')
  return saveLocalBlob(key, await response.blob())
  // #endif
  // #ifdef APP-PLUS
  const path = await new Promise<string>((resolve, reject) => uni.saveFile({
    tempFilePath: tempPath,
    success: result => resolve(result.savedFilePath),
    fail: reject
  }))
  uni.setStorageSync(keyPrefix + key, path)
  return key
  // #endif
}

/** 只使用本账号在本机保存的附件。 */
export function localMediaPath(owner: string, key?: string): string {
  return owner && key?.startsWith(owner + ':') ? cachedMedia(key) : ''
}

/** 根据本机引用恢复页面上的临时预览地址。 */
export function useNoteMedia(owner: () => string, blocks: () => NoteBlock[]) {
  const previews = reactive(new Map<string, string>())
  // #ifdef H5
  watch(() => ({ owner: owner(), keys: blocks().map(block => block.localKey) }),
    ({ owner: current, keys }, _, cleanup) => {
      let active = true
      cleanup(() => { active = false })
      for (const [key, url] of previews) {
        if (!key.startsWith(current + ':') || !keys.includes(key)) {
          URL.revokeObjectURL(url)
          previews.delete(key)
        }
      }
      for (const key of keys) {
        if (!current || !key?.startsWith(current + ':') || previews.has(key)) continue
        void readLocalBlob(key).then(blob => {
          if (active && blob && !previews.has(key)) previews.set(key, URL.createObjectURL(blob))
        }).catch(() => undefined)
      }
    }, { immediate: true })
  onUnmounted(() => previews.forEach(url => URL.revokeObjectURL(url)))
  // #endif
  return (block: NoteBlock) => (block.localKey &&
    (previews.get(block.localKey) || localMediaPath(owner(), block.localKey))) || block.url || ''
}
/** 已上传媒体的展示地址：优先本机缓存，其次原始地址。 */
export function rememberMedia(url: string, localPath: string) {
  try {
    uni.setStorageSync(keyPrefix + url, localPath)
  } catch {
    // 缓存空间不足时仍可直接使用本次路径
  }
}

/** 读取本机已缓存的媒体路径。 */
export function cachedMedia(url: string): string {
  const value = uni.getStorageSync(keyPrefix + url)
  return typeof value === 'string' ? value : ''
}

/** 音频时长（秒），H5 通过临时 audio 元素读取。 */
export function probeDuration(src: string): Promise<number> {
  return new Promise(resolve => {
    // #ifdef H5
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.src = src
    audio.onloadedmetadata = () => {
      const value = Math.round(audio.duration)
      resolve(Number.isFinite(value) ? value : 0)
    }
    audio.onerror = () => resolve(0)
    // #endif
    // #ifndef H5
    resolve(0)
    // #endif
  })
}

/** 把秒数格式化成 mm:ss。 */
export function formatDuration(seconds?: number): string {
  const total = Math.max(0, Math.round(seconds || 0))
  const minute = Math.floor(total / 60)
  const second = total % 60
  return `${minute}:${second.toString().padStart(2, '0')}`
}
