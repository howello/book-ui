import { computed, reactive, ref, watch } from 'vue'
import { bookStoragePrefix, baseApi } from '../api-env'
import type { BookNode, NodeType } from './types'
import { parseContent } from './types'
import { mergePendingNotes, pendingNote, pendingNotes, writePendingNote } from './pending-notes'

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

const token = ref<string>(uni.getStorageSync(tokenKey) || '')
const account = ref<string>(uni.getStorageSync(accountKey) || '')
const nodes = ref<BookNode[]>([])
const loading = ref(false)
const error = ref('')
let cacheRevision = 0
const syncedNotes = new Map<string, { revision: number; node: BookNode }>()

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
  tree?: boolean
  withContent?: boolean
}

function nodeListPath(params: NodeListOptions) {
  // 不用 URLSearchParams：Android WebView 的旧内核没有这个全局对象
  const search: string[] = []
  if (params.tree) search.push('tree=true')
  else if (params.parentId) search.push('parentId=' + encodeURIComponent(params.parentId))
  if (params.withContent !== false) search.push('withContent=true')
  return '/book/nodes' + (search.length ? '?' + search.join('&') : '')
}

/** 立即读取当前账号的本机列表，并叠加尚未上传的感悟。 */
export function readCachedNodes(params: NodeListOptions = {}): BookNode[] | undefined {
  const owner = account.value
  if (!token.value || !owner) return
  const cached = uni.getStorageSync(cacheKey(nodeListPath(params), owner))
  if (Array.isArray(cached)) return mergePendingNotes(owner, cached, params.tree, params.parentId)
  const local = mergePendingNotes(owner, [], params.tree, params.parentId)
  if (local.length) return local
}

/** 刷新列表，远程成功后更新本机缓存。 */
export async function refreshNodes(params: NodeListOptions = {}): Promise<BookNode[]> {
  const path = nodeListPath(params)
  const owner = account.value
  const key = cacheKey(path, owner)
  const revision = cacheRevision
  let value = await request<BookNode[]>(path)
  if (!Array.isArray(value)) throw new ApiError('列表响应无效', 502)
  if (revision !== cacheRevision && (params.tree || params.parentId)) {
    const rows = new Map(value.map(node => [node.id, node]))
    for (const { revision: savedAt, node } of syncedNotes.values()) {
      if (savedAt <= revision || (!params.tree && node.parentId !== params.parentId)) continue
      if ((rows.get(node.id)?.version || 0) >= (node.version || 0)) continue
      rows.set(node.id, params.withContent === false ? { ...node, contentJson: undefined } : node)
    }
    value = [...rows.values()]
  }
  try {
    uni.setStorageSync(key, value)
  } catch {
    // 缓存空间不足不影响在线结果
  }
  return mergePendingNotes(owner, value, params.tree, params.parentId)
}

/** 读取列表：在线优先，断网时读取当前账号的本机缓存。 */
export async function fetchNodes(params: NodeListOptions = {}): Promise<BookNode[]> {
  const owner = account.value
  try {
    return await refreshNodes(params)
  } catch (failure) {
    if (failure instanceof ApiError && failure.status === 0 && token.value && owner === account.value) {
      const cached = readCachedNodes(params)
      if (cached !== undefined) return cached
      throw new ApiError('联网打开后可离线使用', 0)
    }
    throw failure
  }
}

/** 读取节点详情：在线优先，断网回落到本机缓存。 */
export async function fetchNode(id: string): Promise<BookNode> {
  const path = '/book/nodes/' + id
  const owner = account.value
  const key = cacheKey(path, owner)
  const revision = cacheRevision
  const local = pendingNote(owner, id)
  if (local) return local.node
  try {
    let value = await request<BookNode>(path)
    const synced = syncedNotes.get(id)
    if (synced && synced.revision > revision && (synced.node.version || 0) > (value.version || 0)) value = synced.node
    try {
      uni.setStorageSync(key, value)
    } catch {
      // 缓存空间不足不影响在线结果
    }
    return pendingNote(owner, id)?.node ?? value
  } catch (failure) {
    if (failure instanceof ApiError && failure.status === 404) uni.removeStorageSync(key)
    if (failure instanceof ApiError && failure.status === 0 && token.value && owner === account.value) {
      const cached = uni.getStorageSync(key)
      if (cached && typeof cached === 'object') return cached as BookNode
      throw new ApiError('联网打开后可离线使用', 0)
    }
    throw failure
  }
}

/** 后台同步成功后更新已打开的详情及列表缓存。 */
export function cacheSyncedNote(owner: string, node: BookNode) {
  if (owner !== account.value) return
  syncedNotes.set(node.id, { revision: ++cacheRevision, node })
  uni.setStorageSync(cacheKey('/book/nodes/' + node.id, owner), node)
  const prefix = cachePrefix(owner) + '/book/nodes?'
  for (const key of uni.getStorageInfoSync().keys) {
    if (!key.startsWith(prefix)) continue
    const params = key.slice(prefix.length).split('&')
    const tree = params.includes('tree=true')
    const parentId = params.find(part => part.startsWith('parentId='))?.slice(9)
    if (!tree && parentId !== encodeURIComponent(node.parentId || '')) continue
    const rows = uni.getStorageSync(key)
    if (!Array.isArray(rows)) continue
    const saved = params.includes('withContent=true') ? node : { ...node, contentJson: undefined }
    const index = rows.findIndex((row: BookNode) => row.id === node.id)
    if (index < 0) rows.push(saved)
    else rows[index] = saved
    uni.setStorageSync(key, rows)
  }
}

/** 删除节点及其后代，同时清除已删除节点的本机数据。 */
export async function removeNode(id: string): Promise<string[]> {
  const owner = account.value
  const local = pendingNote(owner, id)
  const ids = local && !local.node.version && !local.attempted
    ? [id]
    : await request<string[]>('/book/nodes/' + id, 'DELETE')
  const deleted = new Set(ids)
  ids.forEach(id => syncedNotes.delete(id))
  for (const entry of pendingNotes(owner)) {
    if (deleted.has(entry.node.id) || deleted.has(entry.node.parentId || '')) {
      deleted.add(entry.node.id)
      writePendingNote(owner, entry.node.id)
    }
  }
  const prefix = cachePrefix(owner) + '/book/nodes'
  for (const key of uni.getStorageInfoSync().keys) {
    if (!key.startsWith(prefix)) continue
    const suffix = key.slice(prefix.length)
    if (suffix.startsWith('/')) {
      if (deleted.has(suffix.slice(1))) uni.removeStorageSync(key)
    } else {
      const cached = uni.getStorageSync(key)
      if (Array.isArray(cached)) uni.setStorageSync(key, cached.filter(row => !deleted.has(row.id)))
    }
  }
  return [...deleted]
}

/**
 * 批量补齐节点正文。
 *
 * 列表接口只返回摘要（不含 contentJson），而封面配色、书目信息、
 * 感悟摘要和备注正文都在正文里，因此页面按需并发取详情并回填，
 * 已补齐的节点在本轮会话内不再重复请求。
 */
const detailCache = new Map<string, BookNode>()

/** 补齐一组节点的正文，失败时保留原摘要，不阻断页面渲染。 */
export async function hydrate(nodes: BookNode[], limit = 6): Promise<BookNode[]> {
  const pending = nodes.filter(node => !node.contentJson && !detailCache.has(node.id))
  const queue = [...pending]
  const worker = async () => {
    while (queue.length) {
      const node = queue.shift()
      if (!node) return
      try {
        const detail = await fetchNode(node.id)
        detailCache.set(node.id, detail)
        node.contentJson = detail.contentJson
        node.coverKind = detail.coverKind ?? node.coverKind
        node.coverRef = detail.coverRef ?? node.coverRef
        node.createdAt = detail.createdAt ?? node.createdAt
      } catch {
        // 单个节点读取失败不影响整页
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, queue.length) }, worker))
  return nodes
}

/** 清除本机会话与内存状态。 */
export function clearSession() {
  detailCache.clear()
  syncedNotes.clear()
  token.value = ''

  account.value = ''
  nodes.value = []
  uni.removeStorageSync(tokenKey)
  uni.removeStorageSync(accountKey)
}

/** 保存登录态。 */
export function setSession(value: string, userId: string) {
  token.value = value
  account.value = userId
  uni.setStorageSync(tokenKey, value)
  uni.setStorageSync(accountKey, userId)
}

/** 登录态与全局节点的只读入口。 */
export function useBookStore() {
  return {
    token: computed(() => token.value),
    account: computed(() => account.value),
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
        nodes.value = await fetchNodes({ tree: true })
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

/** 书本下感悟数、感悟下备注数等直接子节点数量。 */
export function childCount(list: BookNode[], id: string, type?: NodeType): number {
  return list.filter(node => node.parentId === id && (!type || node.nodeType === type)).length
}

/** 子树统计：书本卡片上的感悟条数、感悟卡片上的备注条数等。 */
export function descendantStats(list: BookNode[], parentId: string) {
  const groups = groupByParent(list)
  let notes = 0
  let remarks = 0
  let books = 0
  const walk = (id: string) => {
    for (const node of groups.get(id) || []) {
      if (node.nodeType === 'note') notes += 1
      else if (node.nodeType === 'remark') remarks += 1
      else if (node.nodeType === 'book') books += 1
      walk(node.id)
    }
  }
  walk(parentId)
  return { notes, remarks, books }
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
  const walk = (parent: string, depth: number) => {
    for (const node of groups.get(parent) || []) {
      if (seen.has(node.id)) continue
      seen.add(node.id)
      const count = (groups.get(node.id) || []).length
      rows.push({ node, depth, children: count })
      if (count && !collapsed.has(node.id)) walk(node.id, depth + 1)
    }
  }
  walk('', 1)
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
  const groups = groupByParent(list)
  const nodes: MindNode[] = []
  const links: MindLink[] = []
  const nodeW = 196
  const colGap = 92
  const rowGap = 14
  const pad = 46
  let cursorY = 0

  const makeNode = (node: BookNode, depth: number, y: number, children: number): MindNode => ({
    id: node.id,
    title: node.title,
    type: node.nodeType,
    meta: metaOf(node, children),
    x: depth * (nodeW + colGap),
    y,
    w: MIND_SIZE[node.nodeType].w,
    h: MIND_SIZE[node.nodeType].h,
    depth,
    children
  })

  const build = (node: BookNode, depth: number, parent?: MindNode): MindNode => {
    const allKids = groups.get(node.id) || []
    const kids = collapsed.has(node.id) ? [] : allKids
    if (!kids.length) {
      const size = MIND_SIZE[node.nodeType]
      const self = makeNode(node, depth, cursorY, allKids.length)
      cursorY += size.h + rowGap
      nodes.push(self)
      if (parent) links.push({ from: parent, to: self, path: '' })
      return self
    }
    const placed = kids.map(child => build(child, depth + 1))
    const first = placed[0]
    const last = placed[placed.length - 1]
    const height = MIND_SIZE[node.nodeType].h
    const self = makeNode(node, depth, (first.y + first.h / 2 + last.y + last.h / 2) / 2 - height / 2, kids.length)
    nodes.push(self)
    // 父节点先建立，再统一连线，避免重复
    for (const child of placed) links.push({ from: self, to: child, path: '' })
    if (parent) links.push({ from: parent, to: self, path: '' })
    return self
  }

  const categories = groups.get('') || []
  const rootId = '__book_shelf__'
  const children = collapsed.has(rootId) ? [] : categories.map(node => build(node, 1))
  const first = children[0]
  const last = children[children.length - 1]
  const root: MindNode = {
    id: rootId, title: '我的书架', type: 'root', meta: categories.length + ' 个分类',
    depth: 0, x: 0, y: first && last ? (first.y + first.h / 2 + last.y + last.h / 2) / 2 - MIND_SIZE.root.h / 2 : 0,
    ...MIND_SIZE.root, children: categories.length
  }
  nodes.push(root)
  for (const child of children) links.push({ from: root, to: child, path: '' })

  const minX = Math.min(...nodes.map(node => node.x), 0)
  const minY = Math.min(...nodes.map(node => node.y), 0)
  const maxX = Math.max(...nodes.map(node => node.x + node.w), 0)
  const maxY = Math.max(...nodes.map(node => node.y + node.h), 0)
  for (const node of nodes) {
    node.x += pad - minX
    node.y += pad - minY
  }
  for (const link of links) {
    link.path = curvePath(link.from, link.to)
  }
  return {
    nodes,
    links,
    width: maxX - minX + pad * 2,
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
