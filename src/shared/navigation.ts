/** 页面路径集中登记，避免各页散落硬编码字符串。 */
export const ROUTES = {
  home: '/pages/home/index',
  category: '/pages/category/index',
  book: '/pages/book/index',
  note: '/pages/note/index',
  remark: '/pages/remark/index',
  noteEdit: '/pages/note/edit',
  bookEdit: '/pages/book/edit',
  categoryEdit: '/pages/category/edit',
  create: '/pages/create/index',
  mind: '/pages/mind/index',
  mine: '/pages/mine/index',
  login: '/pages/login/index',
  challenge: '/pages/login/challenge'
} as const

/** 节点类型 → 详情页。 */
export function routeForNode(node: { id: string; nodeType?: string }): string {
  switch (node.nodeType) {
    case 'category': return `${ROUTES.category}?id=${node.id}`
    case 'book': return `${ROUTES.book}?id=${node.id}`
    case 'note': return `${ROUTES.note}?id=${node.id}`
    default: return `${ROUTES.remark}?id=${node.id}`
  }
}

/** 节点类型 → 编辑页。 */
export function routeForEdit(node: { id: string; nodeType?: string }): string {
  switch (node.nodeType) {
    case 'book': return `${ROUTES.bookEdit}?id=${node.id}`
    case 'category': return `${ROUTES.categoryEdit}?id=${node.id}`
    case 'note': return `${ROUTES.noteEdit}?id=${node.id}`
    default: return `${ROUTES.remark}?id=${node.id}`
  }
}

/** 统一返回：有上一页就后退，直接打开链接时回到书架。 */
export function goBack() {
  if (getCurrentPages().length > 1) uni.navigateBack()
  else uni.reLaunch({ url: ROUTES.home })
}

/** 跳转并替换当前页，避免编辑页在返回栈里反复叠加。 */
export function redirect(url: string) {
  uni.redirectTo({ url })
}

/** 回到书架根。 */
export function goHome() {
  uni.reLaunch({ url: ROUTES.home })
}
