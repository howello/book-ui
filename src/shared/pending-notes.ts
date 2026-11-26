import { ref } from 'vue'
import { bookStoragePrefix } from '../api-env'
import type { BookNode } from './types'

export interface PendingNote {
  node: BookNode
  revision: string
  attempted?: boolean
  problem?: string
  problemCode?: number
}

const changes = ref(0)
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
}

export function mergePendingNotes(owner: string, rows: BookNode[], tree?: boolean, parentId?: string | null) {
  if (!tree && !parentId) return rows
  const byId = new Map(rows.map(node => [node.id, node]))
  for (const { node } of pendingNotes(owner)) {
    if (tree || node.parentId === parentId) byId.set(node.id, node)
  }
  return [...byId.values()]
}
