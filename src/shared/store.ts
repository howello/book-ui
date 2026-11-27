import { computed, reactive, ref, watch } from 'vue'
import { bookStoragePrefix, baseApi } from '../api-env'
import type { BookNode, NodeType } from './types'
import { parseContent } from './types'
import { clearCacheRecords, listCache, readCache, writeCache, writeCacheBatch } from './cache-db'
import { clearScopeMedia, rememberScopeMedia } from './scope-media'
import { pendingNote, pendingNotes, restorePendingNotes, writePendingNote } from './pending-notes'

/** 节点类型显示名。 */
export const TYPE_NAMES: Record<NodeType, string> = {
  category: '分类',
  book: '书本',
  note: '感悟',
  remark: '备注'
}

/** 节点类型对应的图标。 */
export const TYPE_ICONS: Record<NodeType | 'root', string> = {
  root: 'shelf',
  category: 'folder',
  book: 'book',
  note: 'quote',
  remark: 'corner'
}

/** 按类型取图标，未知类型回退到备注。 */
export function iconOfType(type: NodeType | 'root' | string): string {
  return TYPE_ICONS[type as NodeType] || TYPE_ICONS.remark
}

/** 节点类型对应的强调色（知识树、列表徽标共用）。 */
export const TYPE_TONES: Record<NodeType | 'root', { accent: string; tint: string }> = {
  root: { accent: '#7A5533', tint: '#F6EBDC' },
  category: { accent: '#8E6438', tint: '#F8EFDF' },
  book: { accent: '#9E4433', tint: '#F8E8E2' },
  note: { accent: '#4C6350', tint: '#EBF0E9' },
  remark: { accent: '#33475B', tint: '#E8EDF1' }
}

/** 按类型取强调色，未知类型回退到备注。 */
export function toneOfType(type: NodeType | 'root' | string) {
  return TYPE_TONES[type as NodeType] || TYPE_TONES.remark
}

/** 子节点类型约束：分类 → 书本 → 感悟 → 备注 → 备注。 */
export function childTypeOf(parent?: BookNode | null): NodeType {
  if (!parent) return 'category'
  if (parent.nodeType === 'category') return 'book'
  if (parent.nodeType === 'book') return 'note'
  return 'remark'
}

/** 概览统计。 */
export interface ShelfStats {
  categories: number
  books: number
  notes: number
  weekNotes: number
}

const tokenKey = bookStoragePrefix + '-token'
const accountKey = bookStoragePrefix + '-account'
const profileKey = (userId: string) => `${bookStoragePrefix}-profile:${userId}`

interface AccountProfile {
  userName: string
  nickName: string
  avatar: string
}

interface AccountInfo {
  user?: Partial<AccountProfile> & { userId?: number | string }
}

const token = ref<string>(uni.getStorageSync(tokenKey) || '')
const account = ref<string>(uni.getStorageSync(accountKey) || '')
const profile = ref<AccountProfile | null>(token.value && account.value ? uni.getStorageSync(profileKey(account.value)) || null : null)
const nodes = ref<BookNode[]>([])
const loading = ref(false)
const error = ref('')

/** 本地缓存键按账号隔离，切换账号不会串数据。 */
const cachePrefix = (owner: string) => `${bookStoragePrefix}-cache:${owner}:`
const cacheKey = (path: string, owner = account.value) => cachePrefix(owner) + path

/** 统一的接口错误。 */
export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** 发起一次业务请求，统一处理 401 与业务错误码。 */
export function request<T>(url: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', data?: object): Promise<T> {
  const api = baseApi()
  if (!api) return Promise.reject(new ApiError('请配置 App 后端地址', 0))
  const requestToken = token.value
  const owner = account.value
  const active = () => requestToken === token.value && owner === account.value
  return new Promise<T>((resolve, reject) => {
    uni.request({
      url: api + url,
      method,
      data,
      timeout: 20000,
      header: requestToken ? { Authorization: 'Bearer ' + requestToken } : {},
      success(response) {
        if (!active()) {
          reject(new ApiError('登录账号已变化', 499))
          return
        }
        const result = response.data as { code?: number; msg?: string; data?: T }
        const status = result?.code || response.statusCode
        if (status === 401) clearSession()
        if (status !== 200) {
          reject(new ApiError(result?.msg || '请求失败', status))
          return
        }
        resolve((result?.data ?? result) as T)
      },
      fail() {
        reject(active() ? new ApiError('网络不可用', 0) : new ApiError('登录账号已变化', 499))
      }
    })
  })
}

interface NodeListOptions {
  parentId?: string | null
}

interface ScopeDelta {
  upserts: BookNode[]
  removed: string[]
  order: string[]
  parent?: BookNode | null
}

export const downloadProgress = reactive({ running: 0, completed: 0, total: 0, changed: 0, problem: '', updatedAt: 0 })
const scopeRequests = new Map<string, Promise<BookNode[]>>()
const cacheEpoch = new Map<string, number>()
const clearingOwners = new Set<string>()
let beforePull: () => Promise<void> = async () => {}
let wakeUploader: () => void = () => {}
let lastScope: string | null | undefined

const storagePrefix = (owner: string) => 'download:' + owner + ':'
const scopeKey = (owner: string, parent?: string | null) => storagePrefix(owner) + 'scope:' + (parent || '')
const nodeKey = (owner: string, id: string) => storagePrefix(owner) + 'node:' + id

export function registerBeforePull(flush: () => Promise<void>, wake: () => void) {
  beforePull = flush
  wakeUploader = wake
}

export function refreshActiveScope() {
  if (lastScope !== undefined && token.value) void refreshNodes({ parentId: lastScope }).catch(() => undefined)
}

async function cached<T>(key: string) {
  return readCache<T>(key).catch(() => undefined)
}

async function persist<T>(key: string, value: T | undefined) {
  await writeCache(key, value).catch(() => undefined)
}

function visibleScope(owner: string, parent: string | null, rows: BookNode[]) {
  const merged = new Map(rows.map(node => [node.id, node]))
  for (const entry of pendingNotes(owner)) {
    if (entry.operation === 'delete' || (entry.node.parentId || null) !== parent) {
      merged.delete(entry.node.id)
    } else {
      merged.set(entry.node.id, { ...merged.get(entry.node.id), ...entry.node })
    }
  }
  return [...merged.values()].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id))
}

async function readScope(owner: string, parent: string | null) {
  const rows = await cached<BookNode[]>(scopeKey(owner, parent))
  if (rows) return rows
  const old = uni.getStorageSync(cacheKey('/book/nodes?tree=true&withContent=true', owner))
  return Array.isArray(old) ? (old as BookNode[]).filter(row => (row.parentId || null) === parent) : undefined
}

/** 仅读取当前父节点下已经缓存的直接子节点。 */
export async function readCachedNodes({ parentId = null }: NodeListOptions = {}) {
  const owner = account.value
  if (!token.value || !owner) return
  const rows = await readScope(owner, parentId)
  if (owner !== account.value || !token.value) return
  await restorePendingNotes(owner)
  const visible = visibleScope(owner, parentId, rows || [])
  return rows || visible.length ? visible : undefined
}

/** 发送本层已有的指纹，只接收本层变化。 */
export function refreshNodes({ parentId = null }: NodeListOptions = {}): Promise<BookNode[]> {
  const owner = account.value
  const currentToken = token.value
  if (clearingOwners.has(owner)) return Promise.reject(new ApiError('正在清理本地缓存', 499))
  const epoch = cacheEpoch.get(owner) || 0
  const key = scopeKey(owner, parentId)
  const active = () => owner === account.value && currentToken === token.value && epoch === (cacheEpoch.get(owner) || 0)
  const queryKey = JSON.stringify([key, currentToken, epoch])
  lastScope = parentId
  const existing = scopeRequests.get(queryKey)
  if (existing) return existing
  if (!downloadProgress.running) Object.assign(downloadProgress, { completed: 0, total: 0, changed: 0, problem: '' })
  downloadProgress.running++
  downloadProgress.total++
  const task = (async () => {
    await beforePull()
    if (!active()) throw new ApiError('当前缓存已变化', 499)
    const baseline = await readScope(owner, parentId) || []
    const known: Record<string, string> = {}
    for (const node of baseline) if (node.cacheVersion) known[node.id] = node.cacheVersion
    const parent = parentId ? await cachedNode(owner, parentId) : undefined
    const delta = await request<ScopeDelta>('/book/nodes/scope', 'POST', { parentId, known, parentVersion: parent?.cacheVersion })
    if (!active()) throw new ApiError('当前缓存已变化', 499)
    if (!Array.isArray(delta?.order) || !Array.isArray(delta.upserts) || !Array.isArray(delta.removed)) {
      throw new ApiError('同步响应无效', 502)
    }
    const merged = new Map(baseline.map(row => [row.id, row]))
    for (const row of delta.upserts) merged.set(row.id, row)
    const rows = delta.order.map(id => merged.get(id))
    if (rows.some(row => !row)) throw new ApiError('本层数据不完整，请重试', 502)
    const ready = rows as BookNode[]
    await persist(key, ready)
    const changed = delta.parent ? [...delta.upserts, delta.parent] : delta.upserts
    await writeCacheBatch(changed.map(row => [nodeKey(owner, row.id), row])).catch(() => undefined)
    for (const id of delta.removed) {
      const old = await cached<BookNode>(nodeKey(owner, id))
      if (old && (old.parentId || null) === parentId) await persist(nodeKey(owner, id), undefined)
    }
    if (!active()) throw new ApiError('当前缓存已变化', 499)
    rememberScopeMedia(owner, delta.parent ? [...ready, delta.parent] : ready)
    downloadProgress.changed += changed.length + delta.removed.length
    downloadProgress.completed++
    downloadProgress.updatedAt = Date.now()
    return visibleScope(owner, parentId, ready)
  })().catch(error => {
    if (active()) downloadProgress.problem = error instanceof Error ? error.message : '更新失败'
    throw error
  }).finally(() => {
    scopeRequests.delete(queryKey)
    downloadProgress.running--
  })
  scopeRequests.set(queryKey, task)
  return task
}

/** 先回显本层缓存，再异步更新；离线时保留已读的数据。 */
export async function fetchNodes(params: NodeListOptions = {}, showCached?: (rows: BookNode[]) => void): Promise<BookNode[]> {
  const local = await readCachedNodes(params)
  if (local) showCached?.(local)
  try {
    return await refreshNodes(params)
  } catch (error) {
    if (local && error instanceof ApiError && (error.status === 0 || error.status >= 500)) return local
    throw error
  }
}

async function cachedNode(owner: string, id: string) {
  const detail = await cached<BookNode>(nodeKey(owner, id))
  if (detail) return detail
  const legacy = uni.getStorageSync(cacheKey('/book/nodes/' + id, owner))
  if (legacy?.id === id) return legacy as BookNode
  const old = uni.getStorageSync(cacheKey('/book/nodes?tree=true&withContent=true', owner))
  return Array.isArray(old) ? (old as BookNode[]).find(node => node.id === id) : undefined
}

/** 详情优先读取未上传修改与本机内容。 */
export async function fetchNode(id: string): Promise<BookNode> {
  const owner = account.value
  await restorePendingNotes(owner)
  const local = pendingNote(owner, id)
  if (local?.operation === 'delete') throw new ApiError('节点不存在或已删除', 404)
  if (local) return local.node
  const value = await cachedNode(owner, id)
  if (value) return value
  await beforePull()
  const remote = await request<BookNode>('/book/nodes/' + id)
  if (owner === account.value) await persist(nodeKey(owner, id), remote)
  return remote
}

/** 只补面包屑中的祖先，优先查已经访问过的节点。 */
export async function fetchNodePath(id: string): Promise<BookNode[]> {
  if (!id) return []
  const owner = account.value
  await restorePendingNotes(owner)
  const seen = new Set<string>()
  const path: BookNode[] = []
  let cursor: string | null = id
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    const pending = pendingNote(owner, cursor)
    if (pending?.operation === 'delete') throw new ApiError('节点不存在或已删除', 404)
    const node: BookNode | undefined = pending?.node || await cachedNode(owner, cursor)
    if (!node) {
      await beforePull()
      const ancestors = await request<BookNode[]>('/book/nodes/' + cursor + '/path')
      if (owner !== account.value) throw new ApiError('登录账号已变化', 499)
      for (const row of ancestors) await persist(nodeKey(owner, row.id), row)
      return [...ancestors, ...path.reverse()]
    }
    path.push(node)
    cursor = node.parentId || null
  }
  return path.reverse()
}

export async function fetchNodePage(id: string, showCached?: (rows: BookNode[]) => void) {
  const path = await fetchNodePath(id)
  const owner = account.value
  try {
    const rows = await fetchNodes({ parentId: id }, local => showCached?.([...path, ...local]))
    return [...await fetchNodePath(id), ...rows]
  } catch (error) {
    if (path.length && owner === account.value && error instanceof ApiError && error.status === 0) return path
    throw error
  }
}

/** 导出由用户触发，逐层读取所选子树。 */
export async function fetchSubtree(id: string) {
  const result: BookNode[] = []
  const pending = [id]
  const seen = new Set(pending)
  while (pending.length) {
    const rows = await fetchNodes({ parentId: pending.pop()! })
    for (const row of rows) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      result.push(row)
      if (row.childCount !== 0) pending.push(row.id)
    }
  }
  return result
}

export async function cacheSyncedNote(owner: string, node: BookNode) {
  if (owner !== account.value || clearingOwners.has(owner)) return
  const old = await cachedNode(owner, node.id)
  if (clearingOwners.has(owner)) return
  const refresh = { ...node, childCount: old?.childCount }
  await persist(nodeKey(owner, node.id), refresh)
  const destination = node.parentId || null
  const previous = old?.parentId || null
  for (const parent of new Set([destination, previous])) {
    const key = scopeKey(owner, parent)
    const rows = await cached<BookNode[]>(key)
    if (!rows) continue
    const others = rows.filter(row => row.id !== node.id)
    await persist(key, parent === destination ? [...others, refresh] : others)
  }
}

export async function cacheSyncedDeletion(owner: string, ids: string[]) {
  if (owner !== account.value || clearingOwners.has(owner)) return
  const deleted = new Set(ids)
  for (const id of ids) {
    await persist(nodeKey(owner, id), undefined)
    await persist(scopeKey(owner, id), undefined)
  }
  const scopes = await listCache<BookNode[]>(storagePrefix(owner) + 'scope:').catch(() => [])
  for (const [key, rows] of scopes) {
    if (rows.some(row => deleted.has(row.id))) await persist(key, rows.filter(row => !deleted.has(row.id)))
  }
}

/** 本机立即隐藏，联网后由上传队列提交删除。 */
export async function removeNode(id: string): Promise<string[]> {
  const owner = account.value
  const node = await fetchNode(id)
  const local = pendingNote(owner, id)
  const byParent = groupByParent(pendingNotes(owner).map(entry => entry.node))
  const ids = [id]
  const seen = new Set(ids)
  for (let index = 0; index < ids.length; index++) {
    for (const child of byParent.get(ids[index]) || []) {
      if (!seen.has(child.id)) { seen.add(child.id); ids.push(child.id) }
    }
  }
  for (const child of ids.slice(1)) writePendingNote(owner, child)
  if (local && !node.version && !local.attempted) writePendingNote(owner, id)
  else writePendingNote(owner, id, { node, revision: Date.now().toString(36) + ':delete', operation: 'delete' })
  wakeUploader()
  return ids
}

export async function cachedScopeCount(owner: string) {
  return (await listCache<BookNode[]>(storagePrefix(owner) + 'scope:').catch(() => [])).length
}

export async function clearOfflineCache(owner: string) {
  if (!owner || clearingOwners.has(owner)) return
  clearingOwners.add(owner)
  cacheEpoch.set(owner, (cacheEpoch.get(owner) || 0) + 1)
  try {
    await Promise.allSettled([...scopeRequests.values()])
    await clearCacheRecords(storagePrefix(owner))
    for (const key of uni.getStorageInfoSync().keys) {
      if (key.startsWith(cachePrefix(owner))) uni.removeStorageSync(key)
    }
    await clearScopeMedia(owner)
    if (owner === account.value) {
      lastScope = undefined
      Object.assign(downloadProgress, { completed: 0, total: 0, changed: 0, problem: '', updatedAt: 0 })
    }
  } finally {
    clearingOwners.delete(owner)
  }
}

export async function fetchShelfStats(showCached?: (value: ShelfStats) => void) {
  const key = storagePrefix(account.value) + 'stats'
  const saved = await cached<ShelfStats>(key)
  if (saved) showCached?.(saved)
  try {
    const fresh = await request<ShelfStats>('/book/nodes/stats')
    await persist(key, fresh)
    return fresh
  } catch (error) {
    if (saved) return saved
    throw error
  }
}

/** 清除本机会话与内存状态。 */
export function clearSession() {
  lastScope = undefined
  token.value = ''

  account.value = ''
  profile.value = null
  nodes.value = []
  uni.removeStorageSync(tokenKey)
  uni.removeStorageSync(accountKey)
}

/** 保存登录态。 */
export function setSession(value: string, userId: string) {
  token.value = value
  account.value = userId
  profile.value = userId ? uni.getStorageSync(profileKey(userId)) || null : null
  uni.setStorageSync(tokenKey, value)
  uni.setStorageSync(accountKey, userId)
}

/** 获取当前登录用户的资料，并为离线显示按用户缓存。 */
export async function refreshAccountProfile() {
  const sessionToken = token.value
  const sessionAccount = account.value
  const { user } = await request<AccountInfo>('/getInfo')
  const userId = String(user?.userId || '')
  if (!userId || (sessionAccount && sessionAccount !== userId)) {
    throw new ApiError('无法读取账号信息，请重试', 502)
  }
  if (sessionToken !== token.value || sessionAccount !== account.value) {
    throw new ApiError('登录账号已变化', 499)
  }
  if (!sessionAccount) setSession(sessionToken, userId)
  const fresh = {
    userName: user?.userName?.trim() || '',
    nickName: user?.nickName?.trim() || '',
    avatar: user?.avatar?.trim() || ''
  }
  profile.value = fresh
  try {
    uni.setStorageSync(profileKey(userId), fresh)
  } catch {
    // 存储空间不足时，当前会话仍可使用已取得的资料。
  }
}

/** 登录态与全局节点的只读入口。 */
export function useBookStore() {
  return {
    token: computed(() => token.value),
    account: computed(() => account.value),
    profile: computed(() => profile.value),
    nodes: computed(() => nodes.value),
    loading: computed(() => loading.value),
    error: computed(() => error.value),
    setError(value: string) {
      error.value = value
    },
    async loadTree() {
      if (!token.value) return
      loading.value = true
      try {
        nodes.value = await fetchNodes()
      } catch (failure) {
        error.value = failure instanceof Error ? failure.message : '加载失败'
      } finally {
        loading.value = false
      }
    }
  }
}

/** 节点按父节点分组，供书架与知识树共用。 */
export function groupByParent(list: BookNode[]): Map<string, BookNode[]> {
  const groups = new Map<string, BookNode[]>()
  for (const node of list) {
    const key = node.parentId || ''
    const group = groups.get(key) || []
    group.push(node)
    groups.set(key, group)
  }
  for (const group of groups.values()) {
    group.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.title.localeCompare(b.title, 'zh'))
  }
  return groups
}

/** 统计书架概览：分类数、书本数、感悟数、本周新增感悟数。 */
export function shelfStats(list: BookNode[]): ShelfStats {
  const since = Date.now() - 7 * 86_400_000
  let categories = 0
  let books = 0
  let notes = 0
  let weekNotes = 0
  for (const node of list) {
    if (node.nodeType === 'category') categories += 1
    else if (node.nodeType === 'book') books += 1
    else if (node.nodeType === 'note') {
      notes += 1
      const time = Date.parse((node.createdAt || node.updatedAt || '').replace(' ', 'T'))
      if (Number.isFinite(time) && time >= since) weekNotes += 1
    }
  }
  return { categories, books, notes, weekNotes }
}

/** 节点在树中的祖先链（由近到远，不含自身）。 */
export function ancestorsOf(list: BookNode[], id?: string | null): BookNode[] {
  const byId = new Map(list.map(node => [node.id, node]))
  const chain: BookNode[] = []
  const seen = new Set<string>()
  let cursor = id ? byId.get(id)?.parentId : undefined
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor)
    const parent = byId.get(cursor)
    if (!parent) break
    chain.push(parent)
    cursor = parent.parentId || undefined
  }
  return chain
}

/** 面包屑：根书架 + 祖先链 + 当前节点。 */
export function breadcrumbOf(list: BookNode[], id?: string | null): BookNode[] {
  const byId = new Map(list.map(node => [node.id, node]))
  const cursor = id ? byId.get(id) : undefined
  return cursor ? [...ancestorsOf(list, id).reverse(), cursor] : []
}

/** 分类选择项显示完整路径，便于区分同名子分类。 */
export function categoryOptions(list: BookNode[]) {
  const categories = list.filter(node => node.nodeType === 'category')
  const labels = new Map<string, string>()
  for (const { node, root } of outlineRows(categories, new Set())) {
    if (root) continue
    const parent = node.parentId ? labels.get(node.parentId) : undefined
    labels.set(node.id, parent ? `${parent} / ${node.title}` : node.title)
  }
  return categories.map(node => ({ node, label: labels.get(node.id) || node.title }))
}

/** 书本下感悟数、感悟下备注数等直接子节点数量。 */
export function childCount(list: BookNode[], id: string, type?: NodeType): number {
  return list.filter(node => node.parentId === id && (!type || node.nodeType === type)).length
}

/** 子树统计：书本卡片上的感悟条数、感悟卡片上的备注条数等。 */
export function descendantStats(list: BookNode[], parentId: string) {
  const groups = groupByParent(list)
  const totals = { notes: 0, remarks: 0, books: 0, categories: 0 }
  const pending = [parentId]
  const seen = new Set(pending)
  while (pending.length) {
    const id = pending.pop()!
    for (const node of groups.get(id) || []) {
      if (seen.has(node.id)) continue
      seen.add(node.id)
      if (node.nodeType === 'note') totals.notes += 1
      else if (node.nodeType === 'remark') totals.remarks += 1
      else if (node.nodeType === 'book') totals.books += 1
      else if (node.nodeType === 'category') totals.categories += 1
      pending.push(node.id)
    }
  }
  return totals
}

/** 树的扁平化结果：按展开状态输出深度与可见行。 */
export interface TreeRow {
  node: BookNode
  depth: number
  children: number
  /** 虚拟根（我的书架）没有真实节点 */
  root?: boolean
}

/** 知识树虚拟根节点 ID，与画布共用。 */
export const ROOT_ID = '__book_shelf__'

/** 虚拟根节点对象：仅用于展示，不参与服务端读写。 */
export function rootNode(categoryCount: number): BookNode {
  return {
    id: ROOT_ID,
    parentId: null,
    nodeType: 'category',
    title: '我的书架',
    sortOrder: -1,
    contentJson: JSON.stringify({ desc: `${categoryCount} 个分类` })
  }
}

/** 生成目录大纲行：折叠的节点不再展开其子节点。 */
export function outlineRows(list: BookNode[], collapsed: Set<string>): TreeRow[] {
  const groups = groupByParent(list)
  const rows: TreeRow[] = []
  const roots = groups.get('') || []
  // 与画布一致：大纲第一行也是虚拟根「我的书架」
  rows.push({ node: rootNode(roots.length), depth: 0, children: roots.length, root: true })
  if (collapsed.has(ROOT_ID)) return rows
  const seen = new Set<string>()
  const pending = [...roots].reverse().map(node => ({ node, depth: 1 }))
  while (pending.length) {
    const { node, depth } = pending.pop()!
    if (seen.has(node.id)) continue
    seen.add(node.id)
    const children = groups.get(node.id) || []
    rows.push({ node, depth, children: node.childCount ?? children.length })
    if (collapsed.has(node.id)) continue
    for (let index = children.length - 1; index >= 0; index -= 1) {
      pending.push({ node: children[index], depth: depth + 1 })
    }
  }
  return rows
}

/** 思维导图节点尺寸：根/分类/书/感悟/备注依次降低。 */
export const MIND_SIZE = {
  root: { w: 196, h: 62 },
  category: { w: 196, h: 56 },
  book: { w: 196, h: 52 },
  note: { w: 196, h: 52 },
  remark: { w: 196, h: 48 }
} as const

/** 思维导图布局：depth 决定 x，叶子顺序决定 y，父节点取首末子节点中点。 */
export interface MindNode {
  id: string
  title: string
  type: NodeType | 'root'
  meta: string
  x: number
  y: number
  w: number
  h: number
  depth: number
  children: number
}

/** 思维导图连线。 */
export interface MindLink {
  from: MindNode
  to: MindNode
  path: string
}

/** 横向树布局结果。 */
export interface MindLayout {
  nodes: MindNode[]
  links: MindLink[]
  width: number
  height: number
}

/** 计算思维导图布局；O(n) 一次遍历。 */
export function mindLayout(list: BookNode[], collapsed: Set<string>): MindLayout {
  const rows = outlineRows(list, collapsed)
  const nodes: MindNode[] = []
  const childrenByParent = new Map<string, MindNode[]>()
  const links: MindLink[] = []
  const nodeW = 196
  const colGap = 92
  const rowGap = 14
  const pad = 46
  let cursorY = 0

  const parents = new Set(rows.filter(row => !row.root).map(row => row.node.parentId || ROOT_ID))
  for (const row of rows) {
    const type = row.root ? 'root' : row.node.nodeType
    const size = MIND_SIZE[type]
    const placed: MindNode = {
      id: row.node.id,
      title: row.node.title,
      type,
      meta: row.root ? `${row.children} 个分类` : metaOf(row.node, row.children),
      x: row.depth * (nodeW + colGap),
      y: cursorY,
      ...size,
      depth: row.depth,
      children: row.children
    }
    nodes.push(placed)
    if (!row.root) {
      const parent = row.node.parentId || ROOT_ID
      const siblings = childrenByParent.get(parent) || []
      siblings.push(placed)
      childrenByParent.set(parent, siblings)
    }
    if (!parents.has(placed.id) || collapsed.has(placed.id)) cursorY += size.h + rowGap
  }

  let minY = 0
  let maxX = 0
  let maxY = 0
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index]
    const children = childrenByParent.get(node.id)
    if (children?.length) {
      const first = children[0]
      const last = children[children.length - 1]
      node.y = (first.y + first.h / 2 + last.y + last.h / 2) / 2 - node.h / 2
      for (const child of children) links.push({ from: node, to: child, path: '' })
    }
    minY = Math.min(minY, node.y)
    maxX = Math.max(maxX, node.x + node.w)
    maxY = Math.max(maxY, node.y + node.h)
  }
  for (const node of nodes) {
    node.x += pad
    node.y += pad - minY
  }
  for (const link of links) {
    link.path = curvePath(link.from, link.to)
  }
  return {
    nodes,
    links,
    width: maxX + pad * 2,
    height: maxY - minY + pad * 2
  }
}

/** 父右缘 → 子左缘的 S 形三次贝塞尔。 */
export function curvePath(from: MindNode, to: MindNode): string {
  const x1 = from.x + from.w
  const y1 = from.y + from.h / 2
  const x2 = to.x
  const y2 = to.y + to.h / 2
  const dx = Math.max(40, (x2 - x1) * 0.52)
  return `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`
}

/** 节点副标题：书本显示作者，其余按子节点数。 */
function metaOf(node: BookNode, children: number): string {
  if (node.nodeType === 'book') {
    const author = parseContent(node).author
    return author || `${children} 条感悟`
  }
  if (node.nodeType === 'note') {
    const chapter = parseContent(node).chapter
    return chapter || `${children} 条备注`
  }
  if (children) return `${children} 项`
  return TYPE_NAMES[node.nodeType]
}

/** 从根到目标节点的 ID 路径，用于画布高亮。 */
export function pathIds(list: BookNode[], id: string): string[] {
  return [id, ...ancestorsOf(list, id).map(node => node.id)].reverse()
}

/** 响应式主题：浅色 / 深色 / 跟随系统。 */
const themeKey = bookStoragePrefix + '-theme'
const themeIndex = ref<number>(uni.getStorageSync(themeKey) || 0)

/** 跟随系统时监听 prefers-color-scheme，手动模式保持用户选择。 */
const systemDark = ref(false)
// #ifdef H5
if (typeof window !== 'undefined' && window.matchMedia) {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = query.matches
  query.addEventListener?.('change', event => { systemDark.value = event.matches })
}
// #endif

/** 把主题写到 <html data-theme>，让 body 底色与表单控件一起跟随。 */
function applyTheme() {
  // #ifdef H5
  if (typeof document !== 'undefined') {
    const dark = themeIndex.value === 2 || (themeIndex.value === 0 && systemDark.value)
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }
  // #endif
}

/** 主题状态。 */
export function useTheme() {
  const theme = computed(() => {
    if (themeIndex.value === 2) return 'dark'
    if (themeIndex.value === 1) return 'light'
    return systemDark.value ? 'dark' : 'light'
  })
  applyTheme()
  watch(theme, applyTheme)
  return reactive({
    theme,
    index: computed(() => themeIndex.value),
    labels: ['跟随系统', '浅色', '深色'],
    set(index: number) {
      themeIndex.value = Math.max(0, Math.min(2, index))
      uni.setStorageSync(themeKey, themeIndex.value)
      applyTheme()
    }
  })
}
