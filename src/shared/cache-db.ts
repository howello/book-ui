import { bookStoragePrefix } from '../api-env'

/** 缓存按部署环境和账号隔离，App 使用 SQLite，H5 使用 IndexedDB。 */
const name = bookStoragePrefix + '-offline'
interface SqliteBridge {
  isOpenDatabase(options: { name: string; path: string }): boolean
  openDatabase(options: { name: string; path: string; success: () => void; fail: (cause: unknown) => void }): void
  executeSql(options: { name: string; sql: string; success: () => void; fail: (cause: unknown) => void }): void
  selectSql(options: { name: string; sql: string; success: (rows: { value: string; key: string }[]) => void; fail: (cause: unknown) => void }): void
}

let sqliteReady: Promise<void> | undefined
let indexedReady: Promise<IDBDatabase> | undefined

function sqlite() {
  return (plus as unknown as { sqlite: SqliteBridge }).sqlite
}

function execute(sql: string) {
  return new Promise<void>((success, fail) => sqlite().executeSql({ name, sql, success, fail }))
}

function select(sql: string) {
  return new Promise<{ value: string; key: string }[]>((success, fail) => sqlite().selectSql({ name, sql, success, fail }))
}

function quote(value: string) {
  return "'" + value.replace(/'/g, "''").replace(/\u0000/g, '') + "'"
}

function openSqlite() {
  if (!sqliteReady) {
    sqliteReady = (async () => {
      const path = '_doc/' + name + '.db'
      if (!sqlite().isOpenDatabase({ name, path })) {
        await new Promise<void>((success, fail) => sqlite().openDatabase({ name, path, success, fail }))
      }
      await execute('CREATE TABLE IF NOT EXISTS cache_record (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    })().catch(error => { sqliteReady = undefined; throw error })
  }
  return sqliteReady
}

function openIndexed() {
  if (!indexedReady) {
    indexedReady = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 1)
      request.onupgradeneeded = () => request.result.createObjectStore('records')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); indexedReady = undefined }
        resolve(request.result)
      }
    }).catch(error => { indexedReady = undefined; throw error })
  }
  return indexedReady
}

async function indexed<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, result: (value: T) => void) => void) {
  const db = await openIndexed()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction('records', mode)
    let value: T
    tx.oncomplete = () => resolve(value)
    tx.onabort = () => reject(tx.error)
    action(tx.objectStore('records'), result => { value = result })
  })
}

export async function readCache<T>(key: string): Promise<T | undefined> {
  // #ifdef APP-PLUS
  await openSqlite()
  const rows = await select('SELECT value FROM cache_record WHERE key = ' + quote(key))
  return rows[0] ? JSON.parse(rows[0].value) as T : undefined
  // #endif
  // #ifdef H5
  return indexed<T | undefined>('readonly', (store, result) => {
    const query = store.get(key)
    query.onsuccess = () => result(query.result as T | undefined)
  })
  // #endif
}

export async function writeCache<T>(key: string, value: T | undefined) {
  // #ifdef APP-PLUS
  await openSqlite()
  if (value === undefined) await execute('DELETE FROM cache_record WHERE key = ' + quote(key))
  else await execute('INSERT OR REPLACE INTO cache_record (key, value) VALUES (' + quote(key) + ', ' + quote(JSON.stringify(value)) + ')')
  // #endif
  // #ifdef H5
  await indexed<void>('readwrite', store => {
    if (value === undefined) store.delete(key)
    else store.put(value, key)
  })
  // #endif
}

export async function listCache<T>(prefix: string): Promise<[string, T][]> {
  // #ifdef APP-PLUS
  await openSqlite()
  const rows = await select('SELECT key, value FROM cache_record WHERE substr(key, 1, ' + prefix.length + ') = ' + quote(prefix))
  return rows.map(row => [row.key, JSON.parse(row.value) as T])
  // #endif
  // #ifdef H5
  return indexed<[string, T][]>('readonly', (store, result) => {
    const rows: [string, T][] = []
    const cursor = store.openCursor(IDBKeyRange.bound(prefix, prefix + '￿'))
    cursor.onsuccess = () => {
      const row = cursor.result
      if (!row) { result(rows); return }
      rows.push([String(row.key), row.value as T])
      row.continue()
    }
  })
  // #endif
}

export async function clearCacheRecords(prefix: string) {
  // #ifdef APP-PLUS
  await openSqlite()
  await execute('DELETE FROM cache_record WHERE substr(key, 1, ' + prefix.length + ') = ' + quote(prefix))
  // #endif
  // #ifdef H5
  await indexed<void>('readwrite', store => { store.delete(IDBKeyRange.bound(prefix, prefix + '￿')) })
  // #endif
}

export async function writeCacheBatch<T>(rows: [string, T][]) {
  if (!rows.length) return
  // #ifdef APP-PLUS
  await openSqlite()
  for (let index = 0; index < rows.length; index += 24) {
    const batch = rows.slice(index, index + 24).map(([key, value]) => '(' + quote(key) + ', ' + quote(JSON.stringify(value)) + ')')
    await execute('INSERT OR REPLACE INTO cache_record (key, value) VALUES ' + batch.join(', '))
  }
  // #endif
  // #ifdef H5
  await indexed<void>('readwrite', store => { for (const [key, value] of rows) store.put(value, key) })
  // #endif
}
