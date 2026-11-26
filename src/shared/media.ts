import { bookStoragePrefix } from '../api-env'
import { mediaBlob } from '../media-cache'

/** H5 媒体缓存键前缀，包含账号避免串号。 */
const keyPrefix = bookStoragePrefix + '-media:'

/** 生成一次性的本地媒体键。 */
export function newLocalKey(account: string) {
  return `${account}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`
}

/** H5：把 Blob 写入 IndexedDB，并返回可用于立即预览的 Object URL。 */
export async function saveLocalBlob(key: string, blob: Blob): Promise<string> {
  await mediaBlob(key, blob)
  return URL.createObjectURL(blob)
}

/** H5：读取本地媒体 Blob。 */
export function readLocalBlob(key: string): Promise<Blob | undefined> {
  return mediaBlob(key)
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
