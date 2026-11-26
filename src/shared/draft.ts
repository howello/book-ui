import { bookStoragePrefix } from '../api-env'

/**
 * 本地草稿：按账号隔离，键为 `book-draft:<账号>:<草稿标识>`。
 *
 * 设计要点（与实施方案一致）：草稿只存本机，不参与同步；
 * 复网后由用户手动提交，提交成功后删除对应草稿。
 */
const prefix = (account: string) => `${bookStoragePrefix}-draft:${account}`

/** 草稿标识：编辑已有节点用节点 ID，新建用 `new:<类型>`。 */
export function draftId(nodeId?: string, nodeType = 'node') {
  return nodeId ? nodeId : `new:${nodeType}`
}

/** 读取一份草稿。 */
export function readDraft<T>(account: string, id: string): T | undefined {
  if (!account || !id) return undefined
  const value = uni.getStorageSync(`${prefix(account)}:${id}`)
  return value && typeof value === 'object' ? value as T : undefined
}

/** 写入草稿；传入空值等价于删除。 */
export function writeDraft(account: string, id: string, value: unknown) {
  if (!account || !id) return
  const key = `${prefix(account)}:${id}`
  if (value == null) uni.removeStorageSync(key)
  else uni.setStorageSync(key, value)
}

/** 删除草稿。 */
export function clearDraft(account: string, id: string) {
  if (!account || !id) return
  uni.removeStorageSync(`${prefix(account)}:${id}`)
}

/** 当前账号的草稿数量。 */
export function draftCount(account: string): number {
  if (!account) return 0
  return uni.getStorageInfoSync().keys.filter(key => key.startsWith(`${prefix(account)}:`)).length
}

/** 草稿摘要：用于「我的 → 离线数据」列表展示。 */
export interface DraftSummary {
  id: string
  title: string
  nodeType: string
  savedAt: number
}

/** 列出当前账号的草稿摘要，按保存时间倒序。 */
export function listDrafts(account: string): DraftSummary[] {
  if (!account) return []
  const owner = `${prefix(account)}:`
  const rows: DraftSummary[] = []
  for (const key of uni.getStorageInfoSync().keys) {
    if (!key.startsWith(owner)) continue
    const value = uni.getStorageSync(key) as { title?: string; nodeType?: string; savedAt?: number } | ''
    if (!value || typeof value !== 'object') continue
    rows.push({
      id: key.slice(owner.length),
      title: value.title || '未命名草稿',
      nodeType: value.nodeType || 'note',
      savedAt: Number(value.savedAt) || 0
    })
  }
  return rows.sort((a, b) => b.savedAt - a.savedAt)
}
