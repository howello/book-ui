import { bookStoragePrefix } from '../api-env'
import type { BookNode, NodeContent } from './types'
import { parseContent } from './types'

/** 封面配色（与 demo assets/data.js 的 COVERS 一致，均过对比度校验）。 */
export const COVERS: Record<string, { bg: string; ink: string }> = {
  clay: { bg: 'linear-gradient(158deg,#9E4433 0%,#7C3326 55%,#5E2318 100%)', ink: '#FBEFE7' },
  moss: { bg: 'linear-gradient(158deg,#5A7360 0%,#3F5443 58%,#2C3B30 100%)', ink: '#F1F5EC' },
  navy: { bg: 'linear-gradient(158deg,#3D5468 0%,#2B3C4D 58%,#1C2833 100%)', ink: '#EDF2F7' },
  ochre: { bg: 'linear-gradient(158deg,#8F6A20 0%,#7C5A18 55%,#5E4211 100%)', ink: '#FFF6E2' },
  plum: { bg: 'linear-gradient(158deg,#67455A 0%,#4B3042 58%,#332031 100%)', ink: '#F8EDF3' },
  slate: { bg: 'linear-gradient(158deg,#5F686F 0%,#474E54 58%,#31373B 100%)', ink: '#F3F6F8' },
  sand: { bg: 'linear-gradient(158deg,#C6AE88 0%,#BFA679 58%,#B8A06F 100%)', ink: '#2E2210' },
  ink: { bg: 'linear-gradient(158deg,#31302D 0%,#232220 58%,#171614 100%)', ink: '#F2EDE4' },
  rose: { bg: 'linear-gradient(158deg,#A25B5E 0%,#84494C 58%,#633335 100%)', ink: '#FDF0F0' },
  teal: { bg: 'linear-gradient(158deg,#456E6D 0%,#335554 58%,#203C3B 100%)', ink: '#EFF7F5' }
}

/** 可选的配色键（顺序与 demo 色板一致）。 */
export const COVER_KEYS = ['clay', 'moss', 'navy', 'ochre', 'plum', 'teal', 'rose', 'sand', 'ink', 'slate']

/** 封面图案：纯 CSS 背景，不占存储、不依赖网络。 */
export const ARTS: Record<string, { name: string; image: string; size: string }> = {
  plain: { name: '纯色', image: 'none', size: 'auto' },
  stripes: { name: '竖条', image: 'repeating-linear-gradient(90deg, rgba(255,255,255,.15) 0 9px, transparent 9px 24px)', size: 'auto' },
  rings: { name: '圆环', image: 'radial-gradient(circle at 50% 40%, transparent 0 24%, rgba(255,255,255,.15) 24% 28%, transparent 28% 42%, rgba(255,255,255,.11) 42% 46%, transparent 46%)', size: 'auto' },
  grid: { name: '网格', image: 'repeating-linear-gradient(0deg, rgba(255,255,255,.12) 0 1px, transparent 1px 17px), repeating-linear-gradient(90deg, rgba(255,255,255,.12) 0 1px, transparent 1px 17px)', size: 'auto' },
  mount: { name: '山形', image: 'linear-gradient(168deg, transparent 56%, rgba(0,0,0,.20) 56%), linear-gradient(196deg, transparent 50%, rgba(255,255,255,.13) 50%)', size: 'auto' },
  band: { name: '腰封', image: 'linear-gradient(180deg, transparent 0 60%, rgba(255,255,255,.20) 60% 73%, transparent 73%)', size: 'auto' },
  dots: { name: '圆点', image: 'radial-gradient(rgba(255,255,255,.26) 1.5px, transparent 1.6px)', size: '12px 12px' },
  diag: { name: '斜切', image: 'repeating-linear-gradient(135deg, rgba(255,255,255,.13) 0 13px, transparent 13px 32px)', size: 'auto' },
  frame: { name: '边框', image: 'linear-gradient(180deg, transparent 0 5%, rgba(0,0,0,.10) 5% 5.8%, transparent 5.8% 94%, rgba(0,0,0,.10) 94%)', size: 'auto' },
  horizon: { name: '地平', image: 'linear-gradient(180deg, transparent 56%, rgba(255,255,255,.17) 56%, rgba(0,0,0,.15) 100%)', size: 'auto' },
  bigtype: { name: '大字', image: 'linear-gradient(180deg, rgba(255,255,255,.05), rgba(0,0,0,.20))', size: 'auto' }
}

/** 图案键（纯色在前）。 */
export const ART_KEYS = Object.keys(ARTS)

/** 默认配色。 */
export const DEFAULT_COLOR = 'clay'

/** 取一套配色，未知键回退到默认。 */
export function coverPalette(color?: string) {
  return COVERS[color || ''] || COVERS[DEFAULT_COLOR]
}

/** 取一个图案，未知键回退到纯色。 */
export function coverArt(art?: string) {
  return ARTS[art || ''] || ARTS.plain
}

/** 解析 `color:art` 形式的封面引用。 */
export function splitCoverRef(ref?: string | null): { color: string; art: string } {
  const [color, art] = (ref || '').split(':')
  return { color: color && COVERS[color] ? color : DEFAULT_COLOR, art: art && ARTS[art] ? art : 'plain' }
}

/** 组合封面引用。 */
export function joinCoverRef(color: string, art: string): string {
  return `${COVERS[color] ? color : DEFAULT_COLOR}:${ARTS[art] ? art : 'plain'}`
}

/** 节点正文里记录的配色（书本/分类通用）。 */
export function contentCover(content: NodeContent) {
  return {
    color: content.color && COVERS[content.color] ? content.color : DEFAULT_COLOR,
    art: content.art && ARTS[content.art] ? content.art : 'plain'
  }
}

const mediaPrefix = bookStoragePrefix + '-media:'

/**
 * 封面图片地址。
 *
 * theme → 纯 CSS 文字封面；public → 后端返回的媒体地址；
 * local → 随包静态封面；external → 检索到的在线封面（保存前预览）。
 */
export function coverImage(node?: BookNode | null): string {
  if (node?.pendingCover?.localKey) return 'book-local-media:' + node.pendingCover.localKey
  if (node?.pendingCover?.remoteUrl) return node.pendingCover.remoteUrl
  if (!node?.coverKind || !node.coverRef) return ''
  if (node.coverKind === 'public') {
    const cached = uni.getStorageSync(mediaPrefix + node.coverRef)
    if (typeof cached === 'string' && cached) return cached
    return /^(https?:|data:|blob:)/i.test(node.coverRef) ? node.coverRef : ''
  }
  if (node.coverKind === 'local') {
    return libraryCoverUrl(node.coverRef)
  }
  if (node.coverKind === 'external' && /^https:\/\//i.test(node.coverRef)) return node.coverRef
  return ''
}

/** 节点是否为文字封面。 */
export function isThemeCover(node?: BookNode | null): boolean {
  return node?.coverKind === 'theme' || (!node?.coverKind && !node?.coverRef)
}

/** 书本副标题：作者 · N 条感悟。 */
export function bookSubtitle(node: BookNode, notes: number): string {
  const author = parseContent(node).author || ''
  return author ? `${author} · ${notes} 条感悟` : `${notes} 条感悟`
}

/* ============================================================
   本地默认封面图库：分类与书本共用 shared 目录下的 43 张图
   ============================================================ */

/** 图库文件清单，构建时自动收集，新增图片无需改代码。 */
const coverAssets = import.meta.glob<string>('../static/covers/shared/*', {
  eager: true,
  query: '?url',
  import: 'default'
})

/** 图库相对路径清单（相对 src/static/covers）。 */
export const LIBRARY_COVERS: string[] = Object.keys(coverAssets)
  .filter(key => /\.(webp|png|jpe?g|gif)$/i.test(key))
  .sort()
  .map(key => key.slice('../static/covers/'.length))

/** 随机取一张图库封面，避免与当前相同。 */
export function randomLibraryCover(exclude?: string | null): string {
  if (!LIBRARY_COVERS.length) return ''
  if (LIBRARY_COVERS.length === 1) return LIBRARY_COVERS[0]
  let next = LIBRARY_COVERS[Math.floor(Math.random() * LIBRARY_COVERS.length)]
  for (let attempt = 0; attempt < 5 && next === exclude; attempt += 1) {
    next = LIBRARY_COVERS[Math.floor(Math.random() * LIBRARY_COVERS.length)]
  }
  return next
}

/** 取图库封面地址（相对路径 → 构建后的 URL）。 */
export function libraryCoverUrl(ref?: string | null): string {
  if (!ref) return ''
  return coverAssets['../static/covers/' + ref] || ''
}
