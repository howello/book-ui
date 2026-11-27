import { bookStoragePrefix } from './api-env'

/** H5 媒体缓存，键包含账号和附件标识。 */
export async function mediaBlob(key: string, value?: Blob): Promise<Blob | undefined> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(bookStoragePrefix + '-private-media', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('files')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('files', value ? 'readwrite' : 'readonly')
      const store = tx.objectStore('files')
      const request = value ? store.put(value, key) : store.get(key)
      tx.oncomplete = () => resolve(value ? undefined : request.result)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}

/** 仅删除可重新下载的媒体，保留本机附件原件。 */
export async function removeMediaBlobs(prefix: string) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(bookStoragePrefix + '-private-media', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('files')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('files', 'readwrite')
      tx.objectStore('files').delete(IDBKeyRange.bound(prefix, prefix + '\uffff'))
      tx.oncomplete = () => resolve()
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}
