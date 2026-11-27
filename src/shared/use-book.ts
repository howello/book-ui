import { queueNote } from './note-sync'
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import {
  ApiError,
  ancestorsOf,
  breadcrumbOf,
  childCount,
  childTypeOf,
  descendantStats,
  fetchNode,
  fetchNodes,
  fetchNodePage,
  request,
  useBookStore
} from './store'
import type { BookNode, NodeType } from './types'
import { parseContent } from './types'

/** 未登录时统一跳转登录页，并带上回跳地址。 */
export function requireLogin(): boolean {
  const store = useBookStore()
  if (store.token.value) return true
  const pages = getCurrentPages()
  const current = pages[pages.length - 1] as { route?: string; options?: Record<string, string> } | undefined
  const query = current?.options
    ? Object.entries(current.options).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&')
    : ''
  const redirect = current?.route ? `/${current.route}${query ? '?' + query : ''}` : ''
  uni.reLaunch({ url: '/pages/login/index' + (redirect ? '?redirect=' + encodeURIComponent(redirect) : '') })
  return false
}

/** 读取页面参数。 */
export function pageOption(name: string, fallback = ''): string {
  const pages = getCurrentPages()
  const current = pages[pages.length - 1] as { options?: Record<string, string> } | undefined
  const value = current?.options?.[name]
  return value ? decodeURIComponent(value) : fallback
}

/** 树数据 + 当前节点详情的通用加载逻辑。 */
export function useBookData() {
  const store = useBookStore()
  const tree = ref<BookNode[]>([])
  const detail = ref<BookNode>()
  const loading = ref(false)
  const failure = ref('')

  /** 加载整棵树（书架计数、面包屑、知识树共用）。 */
  async function loadTree() {
    if (!store.token.value) return
    try {
      tree.value = detail.value ? await fetchNodePage(detail.value.id) : await fetchNodes()
    } catch (error) {
      failure.value = error instanceof Error ? error.message : '加载失败'
    }
  }

  /** 读取节点详情。 */
  async function loadDetail(id: string) {
    if (!id) return
    try {
      detail.value = await fetchNode(id)
    } catch (error) {
      failure.value = error instanceof Error ? error.message : '加载失败'
    }
  }

  /** 当前节点在树中的定位（详情接口也带 parentId，可直接算祖先）。 */
  const breadcrumb = computed(() => {
    if (!detail.value) return []
    if (tree.value.some(node => node.id === detail.value?.id)) return breadcrumbOf(tree.value, detail.value.id)
    const chain = ancestorsOf(tree.value, detail.value.parentId)
    return [...chain.reverse(), detail.value]
  })

  return { store, tree, detail, loading, failure, loadTree, loadDetail, breadcrumb }
}

/** 一次读取某父节点下的直接子节点。 */
export async function loadChildren(parentId?: string | null): Promise<BookNode[]> {
  return fetchNodes({ parentId })
}

/** 书本卡片上的感悟条数。 */
export function noteCount(tree: BookNode[], bookId: string): number {
  return childCount(tree, bookId, 'note')
}

/** 分类卡片上的书本条数与感悟条数。 */
export function categoryCounts(tree: BookNode[], categoryId: string) {
  const stats = descendantStats(tree, categoryId)
  return { books: stats.books, notes: stats.notes }
}

/** 感悟卡片统计：文字段数、图片数、语音数、备注数。 */
export function noteStats(node: BookNode) {
  const content = parseContent(node)
  const blocks = Array.isArray(content.blocks) ? content.blocks : []
  return {
    text: blocks.filter(block => block.type === 'text').length,
    images: blocks.filter(block => block.type === 'image').length,
    audios: blocks.filter(block => block.type === 'audio').length,
    quotes: blocks.filter(block => block.type === 'quote').length,
    chapter: content.chapter || '',
    summary: content.summary || content.text || '',
    remarks: 0
  }
}

/** 新建/编辑草稿：统一入口，避免各表单重复拼字段。 */
export interface NodeDraft {
  id: string
  parentId: string | null
  nodeType: NodeType
  title: string
  sortOrder: number
  version?: number
}

/** 生成一个 UUID v4，服务端要求节点 ID 为合法 UUID。 */
export function newId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const digit = Math.floor(Math.random() * 16)
    return (char === 'x' ? digit : (digit & 3) | 8).toString(16)
  })
}

/** 当前节点允许新建的子节点类型。 */
export function nextChildType(node?: BookNode | null): NodeType {
  return childTypeOf(node)
}

/** 保存节点：新建走 POST，编辑走 PUT 并带版本。 */
export async function saveNode(node: BookNode, content: string | null): Promise<BookNode> {
  const saved = { ...node, parentId: node.parentId || null, contentJson: content }
  queueNote(useBookStore().account.value, saved)
  return saved
}

/** 上传队列提交节点，使用已有服务端接口。 */
export async function submitNode(node: BookNode, content: string | null): Promise<BookNode> {
  const payload = {
    id: node.id,
    parentId: node.parentId || null,
    nodeType: node.nodeType,
    title: node.title,
    sortOrder: node.sortOrder ?? 0,
    coverKind: node.coverKind ?? null,
    coverRef: node.coverRef ?? null,
    contentJson: content,
    version: node.version
  }
  if (node.version) return request<BookNode>('/book/nodes/' + node.id, 'PUT', payload)
  return request<BookNode>('/book/nodes', 'POST', payload)
}

/** 检索书目。 */
export interface CatalogItem {
  title?: string
  author?: string
  year?: string
  publisher?: string
  translator?: string
  pages?: string
  isbn?: string
  summary?: string
  rating?: string
  /** 顿号分隔的标签文本 */
  tags?: string
  cover?: string
  source?: string
}

/** 检索配图。 */
export interface ImageItem {
  title?: string
  cover?: string
  source?: string
}

/** 书目检索：失败时保留可手填状态。source 取 douban-book / douban-read / weread。 */
export async function searchCatalog(query: string, source = 'douban-book'): Promise<CatalogItem[]> {
  return request<CatalogItem[]>('/book/search/catalog?q=' + encodeURIComponent(query) + '&source=' + encodeURIComponent(source))
}

/** 配图检索：source 取 auto / bing / so360。 */
export async function searchImages(query: string, source = 'auto'): Promise<ImageItem[]> {
  return request<ImageItem[]>('/book/search/images?q=' + encodeURIComponent(query) + '&source=' + encodeURIComponent(source))
}

/** 采用在线封面，转存到共享媒体存储。 */
export async function importCover(url: string): Promise<string> {
  const result = await request<{ url?: string }>('/book/media/import-cover', 'POST', { url })
  if (!result?.url) throw new ApiError('封面转存失败', 0)
  return result.url
}

/** 页面初始化：未登录则跳转，登录后执行一次加载。 */
export function bootstrap(loader: () => Promise<void>, autoShow = false) {
  onLoad(async () => {
    if (!requireLogin()) return
    await loader()
  })
  if (autoShow) onShow(() => { void loader() })
}
