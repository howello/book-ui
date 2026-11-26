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
