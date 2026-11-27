import { ref } from 'vue'
import { bookStoragePrefix } from '../api-env'
import type { BookNode } from './types'
import { listCache, writeCache } from './cache-db'

export interface PendingNote {
  node: BookNode
  revision: string
  operation?: 'delete'
  attempted?: boolean
  problem?: string
  problemCode?: number
}

const changes = ref(0)
const journalPrefix = (owner: string) => 'outbox:' + owner + ':'
const restored = new Map<string, Promise<void>>()
let journalWrite: Promise<unknown> = Promise.resolve()

/** 把旧版待同步感悟带入新的持久化队列。 */
export function restorePendingNotes(owner: string) {
  if (!owner) return Promise.resolve()
  const existing = restored.get(owner)
  if (existing) return existing
  const task = (async () => {
    const saved = await listCache<PendingNote>(journalPrefix(owner)).catch(() => [])
    for (const [, entry] of saved) {
      if (!pendingNote(owner, entry.node.id)) uni.setStorageSync(prefix(owner) + entry.node.id, entry)
    }
    for (const entry of pendingNotes(owner)) writePendingNote(owner, entry.node.id, entry)
  })().catch(() => undefined)
  restored.set(owner, task)
  return task
}
const prefix = (owner: string) => `${bookStoragePrefix}-pending-note:${owner}:`

export function pendingNote(owner: string, id: string): PendingNote | undefined {
  if (!owner) return
  const value = uni.getStorageSync(prefix(owner) + id)
  if (value?.node?.id === id) return value
}

export function pendingNotes(owner: string): PendingNote[] {
  void changes.value
  if (!owner) return []
  const keyPrefix = prefix(owner)
  return uni.getStorageInfoSync().keys.filter(key => key.startsWith(keyPrefix))
    .flatMap(key => {
      const entry = pendingNote(owner, key.slice(keyPrefix.length))
      return entry ? [entry] : []
    })
}

export function writePendingNote(owner: string, id: string, entry?: PendingNote) {
  const key = prefix(owner) + id
  if (entry) uni.setStorageSync(key, entry)
  else uni.removeStorageSync(key)
  changes.value++
  journalWrite = journalWrite.then(() => writeCache(journalPrefix(owner) + id, entry)).catch(() => undefined)
}

export function mergePendingNotes(owner: string, rows: BookNode[], tree?: boolean, parentId?: string | null) {
  if (!tree && !parentId) return rows
  const byId = new Map(rows.map(node => [node.id, node]))
  for (const { node } of pendingNotes(owner)) {
    if (tree || node.parentId === parentId) byId.set(node.id, node)
  }
  return [...byId.values()]
}
