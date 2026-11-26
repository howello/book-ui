/** 读书节点类型：分类 / 书本 / 感悟 / 备注。 */
export type NodeType = 'category' | 'book' | 'note' | 'remark'

/** 感悟正文块。type 为开放集合，新增块型只需前后端各加一个渲染分支。 */
export interface NoteBlock {
  id: string
  type: 'text' | 'image' | 'audio' | 'quote'
  /** 文字 / 引用 / 语音转写正文 */
  text?: string
  /** 已上传媒体的地址 */
  url?: string
  /** 尚未上传时的本地 H5 Blob 键 */
  localKey?: string
  /** 尚未上传时的 App 临时文件路径 */
  path?: string
  /** 图片说明 */
  caption?: string
  /** 语音时长（秒） */
  duration?: number
  /** 引用页码 */
  page?: number
}

/** 感悟附件（与块分离保存，便于上传与离线缓存）。 */
export interface Attachment {
  kind: 'image' | 'audio'
  url?: string
  localKey?: string
  path?: string
}

/** 节点正文 JSON：不同 nodeType 使用其中不同字段。 */
export interface NodeContent {
  /** 分类：一句话说明 */
  desc?: string
  /** 分类 / 书本的封面配色与图案 */
  color?: string
  art?: string
  /** 书本书目信息 */
  author?: string
  translator?: string
  publisher?: string
  year?: string
  pages?: string
  isbn?: string
  rating?: string
  status?: string
  progress?: number
  intro?: string
  tags?: string[]
  /** 感悟 */
  chapter?: string
  summary?: string
  blocks?: NoteBlock[]
  attachments?: Attachment[]
  /** 备注 / 感悟纯文本 */
  text?: string
}

/** 读书节点。 */
export interface BookNode {
  id: string
  userId?: number
  parentId?: string | null
  nodeType: NodeType
  title: string
  sortOrder?: number
  coverKind?: string | null
  coverRef?: string | null
  contentJson?: string | null
  version?: number
  createdAt?: string
  updatedAt?: string
  deletedAt?: string | null
}

/** 解析节点正文，坏 JSON 一律回退为空对象。 */
export function parseContent(node?: BookNode | null): NodeContent {
  if (!node?.contentJson) return {}
  try {
    const value = JSON.parse(node.contentJson) as NodeContent
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

/** 序列化节点正文，空对象不落库。 */
export function stringifyContent(content: NodeContent): string | null {
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(content)) {
    if (value !== undefined && value !== '') clean[key] = value
  }
  // 不用 Object.fromEntries：老 Android WebView 没有这个 API
  return Object.keys(clean).length ? JSON.stringify(clean) : null
}

/** 读取节点正文中的块数组。 */
export function blocksOf(node?: BookNode | null): NoteBlock[] {
  const blocks = parseContent(node).blocks
  return Array.isArray(blocks) ? blocks : []
}
