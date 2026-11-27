<template>
  <AppPage :loading="loading" title="知识树" :subtitle="`${count} 个节点 · ${levels} 层`">
    <view class="mind-tabs">
      <button class="mind-tab" :class="{ on: view === 'outline' }" @click="view = 'outline'">
        <AppIcon name="list" :size="13" />目录大纲
      </button>
      <button class="mind-tab" :class="{ on: view === 'canvas' }" @click="switchCanvas">
        <AppIcon name="map" :size="13" />思维导图
      </button>
    </view>

    <view v-if="error" class="error-tip">{{ error }}</view>

    <!-- 目录大纲 -->
    <scroll-view v-if="view === 'outline'" class="scroll" scroll-y>
      <view class="outline">
        <view
          v-for="row in rows"
          :key="row.node.id"
          class="ol-row"
          :class="{ sel: focus === row.node.id }"
          :style="{ paddingLeft: row.depth * 14 + 'px' }"
          @click="row.root ? goShelf() : toggleRow(row.node)"
        >
          <button
            class="ol-toggle"
            :class="{ open: !collapsed.has(row.root ? ROOT_ID : row.node.id), leaf: !row.children }"
            :aria-label="row.children ? '展开或折叠' : '无子节点'"
            @click.stop="toggle(row.root ? ROOT_ID : row.node.id)"
          >
            <AppIcon name="chev" :size="10" />
          </button>
          <view class="ol-icon" :style="row.root
            ? { background: '#F6EBDC', color: '#7A5533' }
            : { background: toneOf(row.node).tint, color: toneOf(row.node).accent }">
            <AppIcon :name="row.root ? 'shelf' : iconOf(row.node)" :size="13" />
          </view>
          <view class="ol-main">
            <text class="ol-title" :class="row.root ? 'title-root' : 'title-' + row.node.nodeType">{{ row.node.title }}</text>
            <view class="ol-meta">
              <text v-if="row.children" class="badge">{{ row.children }}</text>
              <text class="kind">{{ row.root ? row.children + ' 个分类' : metaOf(row.node, row.children) }}</text>
            </view>
          </view>
          <button class="ol-go" :aria-label="'打开 ' + row.node.title" @click.stop="row.root ? goShelf() : openNode(row.node)">
            <AppIcon name="chev" :size="13" />
          </button>
        </view>

        <view v-if="!rows.length" class="empty">
          <AppIcon name="map" :size="32" />
          <text class="empty-text">还什么都没有，先去书架建一个分类</text>
        </view>
      </view>
    </scroll-view>

    <!-- 思维导图画布 -->
    <view v-else class="canvas-wrap" :class="{ dragging, 'has-selection': selectedNode }" @touchstart="startTouch" @touchmove="moveTouch" @touchend="endTouch" @touchcancel="endTouch">
      <view class="canvas-stage" :style="stageStyle">
        <view class="canvas-plane" :style="planeStyle">
          <template v-for="(link, index) in layout.links" :key="'l' + index">
            <view
              v-for="(segment, part) in edgeSegments(link)"
              :key="'l' + index + '-' + part"
              class="canvas-edge"
              :style="segment"
            />
          </template>
          <view
            v-for="node in layout.nodes"
            :key="node.id"
            class="mnode"
            :class="['mnode-' + node.type, { sel: focus === node.id, dim: !!focus && !pathSet.has(node.id), onPath: pathSet.has(node.id) }]"
            :style="nodeStyle(node)"
            @click="selectCanvasNode(node)"
          >
            <view class="mi" :style="{ background: toneOfType(node.type).tint, color: toneOfType(node.type).accent }">
              <AppIcon :name="iconOfType(node.type)" :size="13" />
            </view>
            <view class="txt">
              <text class="tt">{{ node.title }}</text>
              <text class="tm">{{ node.meta }}</text>
            </view>
            <button
              v-if="node.children"
              class="mn-toggle"
              :aria-label="'展开或折叠'"
              @click.stop="toggle(node.id)"
            >
              {{ collapsed.has(node.id) ? node.children : '−' }}
            </button>
          </view>
        </view>
      </view>

      <text class="canvas-hint">拖拽平移 · 双指缩放 · 单击选中</text>

      <view class="canvas-zoom" @touchstart.stop="noop" @touchmove.stop="noop" @touchend.stop="noop">
        <text>缩放</text>
        <text class="zoom-num">{{ Math.round(scale * 100) }}%</text>
      </view>

      <view class="canvas-tools" @touchstart.stop="noop" @touchmove.stop="noop" @touchend.stop="noop">
        <button class="canvas-tool" aria-label="放大" @click="zoomBy(1.22)"><AppIcon name="zoom-in" :size="15" /></button>
        <button class="canvas-tool" aria-label="缩小" @click="zoomBy(1 / 1.22)"><AppIcon name="zoom-out" :size="15" /></button>
        <button class="canvas-tool" aria-label="适应屏幕" @click="fit"><AppIcon name="fit" :size="15" /></button>
        <button class="canvas-tool" aria-label="展开已加载节点" @click="expandAll"><AppIcon name="expand" :size="15" /></button>
        <button class="canvas-tool" aria-label="折叠到分类" @click="collapseAll"><AppIcon name="collapse" :size="15" /></button>
      </view>

      <view
        v-if="selectedNode"
        class="node-bar on"
        @touchstart.stop.prevent="noop"
        @touchmove.stop.prevent="noop"
        @touchend.stop="noop"
      >
        <view class="nb-ic" :style="{ background: toneOfType(selectedNode.type).tint, color: toneOfType(selectedNode.type).accent }">
          <AppIcon :name="iconOfType(selectedNode.type)" :size="14" />
        </view>
        <view class="nb-main">
          <text class="nb-t">{{ selectedNode.title }}</text>
          <text class="nb-m">{{ labelOfType(selectedNode.type) }} · {{ selectedNode.meta }}</text>
        </view>
        <button class="nb-go" @click.stop="viewSelected" @touchend.stop.prevent="viewSelected">
          查看<AppIcon name="chev" :size="12" />
        </button>
      </view>
    </view>

    <template #footer><AppTabbar current="mind" /></template>
    <AppToast />
</AppPage>
</template>

<script setup lang="ts">
import { computed, nextTick, reactive, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import AppToast from '../../components/AppToast.vue'
import AppIcon from '../../components/AppIcon.vue'
import AppTabbar from '../../components/AppTabbar.vue'
import { ROUTES } from '../../shared/navigation'
import {
  ROOT_ID,
  TYPE_NAMES,
  fetchNodes,
  groupByParent,
  iconOfType,
  mindLayout,
  outlineRows,
  pathIds,
  toneOfType,
  useBookStore
} from '../../shared/store'
import type { MindLayout, MindLink, MindNode } from '../../shared/store'
import type { BookNode, NodeType } from '../../shared/types'
import { parseContent } from '../../shared/types'
import { requireLogin } from '../../shared/use-book'
import { toast } from '../../shared/toast'

const store = useBookStore()
const tree = ref<BookNode[]>([])
const error = ref('')
const view = ref<'outline' | 'canvas'>('outline')
const loadedScopes = new Set<string>()
const loadingScopes = new Set<string>()
const collapsed = reactive(new Set<string>())
const focus = ref('')

const scale = ref(1)
const offset = reactive({ x: 0, y: 0 })
const dragging = ref(false)
/** 画布容器尺寸与屏幕位置；App 端无法用 document 查询，统一缓存 */
const metrics = reactive({ width: 0, height: 0, left: 0, top: 0 })

const rows = computed(() => outlineRows(tree.value, collapsed))

/** 节点总数与最大层数，显示在导航副标题。 */
const count = computed(() => tree.value.length)
const levels = computed(() => {
  const groups = new Map<string, BookNode[]>()
  for (const node of tree.value) {
    const key = node.parentId || ''
    const group = groups.get(key) || []
    group.push(node)
    groups.set(key, group)
  }
  let max = 0
  const walk = (id: string, depth: number) => {
    max = Math.max(max, depth)
    for (const child of groups.get(id) || []) walk(child.id, depth + 1)
  }
  for (const root of groups.get('') || []) walk(root.id, 1)
  return max
})

const layout = computed<MindLayout>(() => mindLayout(tree.value, collapsed))

const selectedNode = computed(() => layout.value.nodes.find(node => node.id === focus.value))
const pathSet = computed(() => new Set(focus.value ? ['__book_shelf__', ...pathIds(tree.value, focus.value)] : []))

const planeStyle = computed(() => ({
  width: layout.value.width + 'px',
  height: layout.value.height + 'px',
  transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale.value})`,
  transformOrigin: '0 0'
}))

const stageStyle = computed(() => ({
  width: layout.value.width * scale.value + 'px',
  height: layout.value.height * scale.value + 'px'
}))

function toneOf(node: BookNode) {
  return toneOfType(node.nodeType)
}

function iconOf(node: BookNode) {
  return iconOfType(node.nodeType)
}

/** 类型显示名：画布节点可能是虚拟根，回退为「书架」。 */
function labelOfType(type: NodeType | 'root') {
  return TYPE_NAMES[type as NodeType] || '书架'
}

/** 大纲行的副标题：书本显示作者，感悟显示章节，其余显示子节点数。 */
function metaOf(node: BookNode, children: number) {
  if (node.nodeType === 'book') return parseContent(node).author || `${children} 条感悟`
  if (node.nodeType === 'note') return parseContent(node).chapter || `${children} 条备注`
  return children ? `${children} 项` : TYPE_NAMES[node.nodeType]
}

/** 点条目：只折叠 / 展开，不跳转；跳转只走右侧箭头。 */
function toggleRow(node: BookNode) {
  if (!node.childCount && !tree.value.some(child => child.parentId === node.id)) return
  focus.value = node.id
  toggle(node.id)
}

function toggle(id: string) {
  if (id === ROOT_ID) {
    if (collapsed.has(id)) collapsed.delete(id)
    else collapsed.add(id)
    return
  }
  if (!collapsed.has(id)) {
    collapsed.add(id)
    return
  }
  collapsed.delete(id)
  void loadLevel(id)
}

function applyLevel(parent: string | null, children: BookNode[]) {
  const current = new Set(children.map(node => node.id))
  const orphaned = new Set(tree.value.filter(node => (node.parentId || null) === parent && !current.has(node.id)).map(node => node.id))
  const byParent = groupByParent(tree.value)
  for (const id of orphaned) for (const child of byParent.get(id) || []) orphaned.add(child.id)
  const known = new Set(tree.value.map(node => node.id))
  tree.value = [...tree.value.filter(node => (node.parentId || null) !== parent && !orphaned.has(node.id)), ...children]
  for (const child of children) if (!known.has(child.id)) collapsed.add(child.id)
  for (const id of orphaned) {
    loadedScopes.delete(id)
    collapsed.delete(id)
  }
}

async function loadLevel(id: string) {
  if (loadingScopes.has(id)) return
  loadingScopes.add(id)
  const owner = store.account.value
  const apply = (children: BookNode[]) => {
    if (owner === store.account.value) {
      applyLevel(id, children)
      loadedScopes.add(id)
    }
  }
  try {
    apply(await fetchNodes({ parentId: id }, apply))
  } catch (failure) {
    if (owner === store.account.value) {
      collapsed.add(id)
      toast(failure instanceof Error ? failure.message : '加载失败')
    }
  } finally {
    loadingScopes.delete(id)
  }
}

/** 画布上的节点颜色：按类型分层，选中与路径高亮用 CSS class 表达。 */
function nodeStyle(node: MindNode) {
  return {
    left: node.x + 'px',
    top: node.y + 'px',
    width: node.w + 'px',
    height: node.h + 'px'
  }
}

/**
 * 用两段细条近似 S 形连线：父右缘先水平向右，子左缘再水平接入。
 * 两端各留一半水平间距，中间用斜线段连接，观感接近 demo 的贝塞尔曲线，
 * 且不依赖 SVG（uni-app 各端对动态路径支持不一致）。
 */
function edgeSegments(link: MindLink) {
  const from = link.from
  const to = link.to
  const x1 = from.x + from.w
  const y1 = from.y + from.h / 2
  const x2 = to.x
  const y2 = to.y + to.h / 2
  const mid = Math.max(20, (x2 - x1) / 2)
  const active = pathSet.value.has(from.id) && pathSet.value.has(to.id)
  const thickness = active ? '2.2px' : '1.5px'
  const background = active ? 'var(--wood-600)' : 'rgba(168, 124, 74, 0.34)'
  const spanX = Math.max(0, x2 - mid - (x1 + mid))
  const segments = [
    { left: x1, top: y1, width: mid, transform: 'rotate(0rad)' },
    { left: x1 + mid, top: y1, width: Math.hypot(spanX, y2 - y1), transform: `rotate(${Math.atan2(y2 - y1, spanX)}rad)` },
    { left: x2 - mid, top: y2, width: mid, transform: 'rotate(0rad)' }
  ]
  return segments.map(segment => ({
    left: segment.left + 'px',
    top: segment.top + 'px',
    width: segment.width + 'px',
    transform: segment.transform,
    background,
    height: thickness
  }))
}

/** 点节点：选中；再次点击同一节点取消选中。查看走左下角动作条。 */
function selectCanvasNode(node: MindNode) {
  focus.value = focus.value === node.id ? '' : node.id
}

function openCanvasNode(node: MindNode) {
  if (node.type === 'root') {
    uni.reLaunch({ url: ROUTES.home })
    return
  }
  const source = tree.value.find(item => item.id === node.id)
  if (!source) return
  openNode(source)
}

/** 虚拟根：回到书架首页。 */
function goShelf() {
  uni.reLaunch({ url: ROUTES.home })
}

/** 防止 click 与 touchend 同时触发导致重复跳转。 */
let lastViewAt = 0

/** 动作条「查看」：跳转当前选中节点的详情。 */
function viewSelected() {
  const node = selectedNode.value
  if (!node) return
  const now = Date.now()
  if (now - lastViewAt < 400) return
  lastViewAt = now
  openCanvasNode(node)
}

/** 阻断画布手势用的空处理器。 */
function noop() {
  // 仅用于 stop/prevent，无需逻辑
}

function openNode(node: BookNode) {
  switch (node.nodeType) {
    case 'category': uni.navigateTo({ url: `${ROUTES.category}?id=${node.id}` }); break
    case 'book': uni.navigateTo({ url: `${ROUTES.book}?id=${node.id}` }); break
    case 'note': uni.navigateTo({ url: `${ROUTES.note}?id=${node.id}` }); break
    default: uni.navigateTo({ url: `${ROUTES.remark}?id=${node.id}` })
  }
}

function zoomBy(factor: number) {
  zoomAt(scale.value * factor, metrics.width / 2, metrics.height / 2)
}

/** 以画布坐标为锚点缩放，限制在 22% ~ 240%。 */
function zoomAt(next: number, cx: number, cy: number) {
  const value = Math.max(0.22, Math.min(2.4, next))
  const wx = (cx - offset.x) / scale.value
  const wy = (cy - offset.y) / scale.value
  scale.value = value
  offset.x = cx - wx * value
  offset.y = cy - wy * value
}

function switchCanvas() {
  view.value = 'canvas'
  void nextTick(() => {
    measure(() => {
      if (!offset.x && !offset.y) homeView()
    })
  })
}

/** 读取画布尺寸；画布刚挂载时尺寸为 0，必须等回调再算视角。 */
function measure(done?: () => void) {
  uni.createSelectorQuery()
    .select('.canvas-wrap')
    .boundingClientRect(rect => {
      if (!rect || Array.isArray(rect)) {
        done?.()
        return
      }
      metrics.width = rect.width || 0
      metrics.height = rect.height || 0
      metrics.left = rect.left || 0
      metrics.top = rect.top || 0
      done?.()
    })
    .exec()
}

/**
 * 默认视角：根节点贴左侧，同时让第一列子节点完整可见。
 *
 * 之前的实现只按根节点定缩放，手机上会把「文学」等分类卡切在右边缘外面；
 * 这里按「根 + 一列子节点」的总宽度算缩放，并把根节点的纵向中心对齐画布中心。
 */
function homeView() {
  const width = metrics.width || 360
  const height = metrics.height || 500
  const root = layout.value.nodes.find(node => node.type === 'root')
  // 根节点到子节点列末端的横向跨度
  const columnCount = layout.value.nodes.reduce((max, node) => Math.max(max, node.depth), 0)
  const spanX = columnCount > 0 ? (columnCount + 1) * 288 : layout.value.width
  // 至少让根 + 1 列可见；画布窄时按比例缩小，但保持文字可读下限
  const fitScale = (width - 28) / Math.max(560, Math.min(spanX, 700))
  scale.value = Math.max(0.62, Math.min(1.05, fitScale))
  offset.x = 12
  const rootCenter = root ? (root.y + root.h / 2) * scale.value : height / 2
  offset.y = height / 2 - rootCenter
}

function fit() {
  measure()
  const width = metrics.width || 360
  const height = metrics.height || 500
  const value = Math.min(width / layout.value.width, height / layout.value.height, 1.15)
  scale.value = Math.max(0.22, value)
  offset.x = (width - layout.value.width * scale.value) / 2
  offset.y = (height - layout.value.height * scale.value) / 2
  toast('已适应屏幕')
}

function expandAll() {
  collapsed.delete(ROOT_ID)
  for (const id of loadedScopes) collapsed.delete(id)
  toast('已展开已加载的节点')
}

function collapseAll() {
  collapsed.clear()
  for (const node of tree.value) collapsed.add(node.id)
  toast('已折叠到分类')
}

/* ---------- 手势：单指平移、双指缩放 ---------- */
let lastX = 0
let lastY = 0
let pinchStart = 0
let pinchScale = 1
let startOffset = { x: 0, y: 0 }
/** 双指开始时的缩放与偏移，作为缩放的固定基准 */
let pinchStartOffset = { x: 0, y: 0 }
let pinchAnchor = { x: 0, y: 0 }
/** 本次触摸是否发生了明显移动（用于区分点空白与拖拽） */
let touchMoved = false
/** 按下时是否落在节点上 */
let downOnNode = false

/**
 * 把触点换算成画布容器内的局部坐标。
 *
 * <p>{@code canvas-wrap} 不在屏幕原点（上方有导航、面包屑、切换条），
 * 直接用 clientX/clientY 会让缩放与平移的基准整体偏移，表现为「乱跳」。</p>
 */
function canvasLocalPoint(touches: Touch[]) {
  // 用 measure() 缓存的容器位置：App 端没有 document，直接查询会抛错
  const left = metrics.left
  const top = metrics.top
  if (touches.length >= 2) {
    return {
      x: (touches[0].clientX + touches[1].clientX) / 2 - left,
      y: (touches[0].clientY + touches[1].clientY) / 2 - top
    }
  }
  return { x: touches[0].clientX - left, y: touches[0].clientY - top }
}

function distance(touches: Touch[]) {
  const [first, second] = touches
  return first && second ? Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY) : 0
}

function startTouch(event: TouchEvent) {
  const touches = Array.from(event.touches || [])
  if (touches.length === 1) {
    dragging.value = true
    touchMoved = false
    // 浮层自己 stop 了触摸，能进到这里说明落在画布或节点上
    const target = event.target as HTMLElement | null
    downOnNode = Boolean(target?.closest?.('.mnode, .mn-toggle'))
    lastX = touches[0].clientX
    lastY = touches[0].clientY
    startOffset = { x: offset.x, y: offset.y }
  } else if (touches.length === 2) {
    touchMoved = true
    pinchStart = distance(touches)
    pinchScale = scale.value
    // 双指缩放以画布左上角为基准，记下起始偏移，避免和单指平移互相污染
    pinchStartOffset = { x: offset.x, y: offset.y }
    pinchAnchor = canvasLocalPoint(touches)
  }
}

function moveTouch(event: TouchEvent) {
  const touches = Array.from(event.touches || [])
  if (touches.length === 2 && pinchStart) {
    if (event.cancelable) event.preventDefault()
    const ratio = distance(touches) / pinchStart
    const next = Math.max(0.22, Math.min(2.4, pinchScale * ratio))
    // 以「起始锚点」固定换算：锚点下的世界坐标保持不变，画布不会漂移
    const worldX = (pinchAnchor.x - pinchStartOffset.x) / pinchScale
    const worldY = (pinchAnchor.y - pinchStartOffset.y) / pinchScale
    const center = canvasLocalPoint(touches)
    scale.value = next
    offset.x = center.x - worldX * next
    offset.y = center.y - worldY * next
    return
  }
  if (!dragging.value || !touches.length) return
  // 双指松开一根后，重新以当前触点为平移起点，避免瞬移
  if (pinchStart) {
    pinchStart = 0
    lastX = touches[0].clientX
    lastY = touches[0].clientY
    startOffset = { x: offset.x, y: offset.y }
    return
  }
  const dx = touches[0].clientX - lastX
  const dy = touches[0].clientY - lastY
  if (Math.hypot(dx, dy) > 6) touchMoved = true
  offset.x = startOffset.x + dx
  offset.y = startOffset.y + dy
}

function endTouch() {
  // 单指轻点空白处：取消选中（拖动或点节点不触发）
  if (!touchMoved && !downOnNode && focus.value) focus.value = ''
  dragging.value = false
  pinchStart = 0
  touchMoved = false
  downOnNode = false
}

let hasLoaded = false
const loading = ref(true)

async function load() {
  if (!store.token.value) return
  error.value = ''
  if (loading.value && hasLoaded) return
  loading.value = true
  hasLoaded = true
  try {
    const apply = (rows: BookNode[]) => {
      applyLevel(null, rows)
      loading.value = false
    }
    apply(await fetchNodes({}, apply))
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onLoad(() => {
  if (requireLogin()) void load()
})
onShow(() => {
  if (store.token.value) void load()
})
</script>

<style scoped>
.mind-tabs {
  display: flex;
  gap: 3px;
  padding: 3px;
  margin: 2px 16px 10px;
  background: rgba(255, 255, 255, 0.68);
  border: 1px solid var(--line);
  border-radius: 10px;
}

.theme-dark .mind-tabs { background: rgba(255, 255, 255, 0.06); }

.mind-tab {
  flex: 1;
  height: 31px;
  border: 0;
  border-radius: 8px;
  background: none;
  font-size: 12px;
  color: var(--ink-500);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  padding: 0;
  margin: 0;
  line-height: 1;
}
.mind-tab.on { background: var(--surface); color: var(--wood-900); font-weight: 600; box-shadow: var(--shadow-card); }

.scroll {
  flex: 1;
  min-height: 0;
  padding: 0 0 10px;
  box-sizing: border-box;
}

.outline { padding: 2px 12px 0; }

/* 大纲外层：每层缩进由行内 padding 控制，这里只留呼吸 */
.outline > .ol-row + .ol-row { margin-top: 2px; }

.ol-row {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 8px;
  border-radius: 10px;
  box-sizing: border-box;
  transition: background 0.15s ease;
}
.ol-row:active { background: rgba(255, 255, 255, 0.7); }
.ol-row.sel {
  background: var(--wood-100);
  box-shadow: inset 0 0 0 1px var(--wood-200);
}
.theme-dark .ol-row:active { background: rgba(255, 255, 255, 0.05); }

/* 非根层级：左侧引导线，强化树形结构 */
.ol-row[style*="padding-left"]:not([style*="padding-left: 0px"])::before {
  content: "";
  position: absolute;
  left: 0;
  top: 6px;
  bottom: 6px;
  width: 1.5px;
  border-radius: 2px;
  background: linear-gradient(180deg, var(--wood-300), transparent);
  opacity: 0.7;
}

.ol-toggle {
  flex: 0 0 16px;
  width: 16px;
  height: 20px;
  border: 0;
  background: none;
  padding: 0;
  margin: 0;
  color: var(--ink-300);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.18s ease, color 0.16s;
}
.ol-toggle.open { transform: rotate(90deg); color: var(--ink-500); }
.ol-toggle.leaf { opacity: 0; pointer-events: none; }

.ol-icon {
  flex: 0 0 26px;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(74, 53, 32, 0.06);
}

/* 书本图标保持「书脊」形，与类型语义呼应 */
.ol-title.title-book + .ol-meta { opacity: 0.9; }

.ol-main { min-width: 0; flex: 1; }
.ol-title { display: block; font-size: 13px; line-height: 1.5; color: var(--ink-800); }
.ol-title.title-root { font-family: var(--serif); font-size: 15.5px; font-weight: 650; }
.ol-title.title-category { font-size: 14px; font-weight: 600; }
.ol-title.title-book { font-family: var(--serif); font-size: 14px; font-weight: 600; }
.ol-title.title-note { font-size: 13px; font-weight: 500; }
.ol-title.title-remark { font-size: 12.5px; color: var(--ink-600); font-weight: 400; }

.ol-meta {
  margin-top: 3px;
  font-size: 10.5px;
  color: var(--ink-400);
  display: flex;
  align-items: center;
  gap: 6px;
  line-height: 1.4;
}
.ol-meta .badge {
  font-size: 9.5px;
  padding: 0 5px;
  border-radius: 4px;
  line-height: 15px;
  background: var(--wood-100);
  color: var(--wood-800);
  font-weight: 600;
}

.ol-go {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 0;
  background: var(--wood-100);
  color: var(--wood-700);
  padding: 0;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.65;
  transition: opacity 0.15s ease, background 0.15s ease;
}
.ol-row.sel .ol-go { background: var(--wood-200); opacity: 1; }



/* ---------- 画布 ---------- */
.canvas-wrap {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  touch-action: none;
  background:
    radial-gradient(circle at 1px 1px, rgba(140, 116, 88, 0.16) 1px, transparent 0) 0 0 / 20px 20px,
    radial-gradient(80% 60% at 50% 0%, rgba(255, 252, 246, 0.96), rgba(243, 236, 224, 0.9));
}

.theme-dark .canvas-wrap {
  background:
    radial-gradient(circle at 1px 1px, rgba(255, 255, 255, 0.06) 1px, transparent 0) 0 0 / 20px 20px,
    radial-gradient(80% 60% at 50% 0%, rgba(42, 36, 31, 0.96), rgba(28, 25, 22, 0.94));
}

.canvas-stage { position: absolute; left: 0; top: 0; }
.canvas-plane { position: absolute; left: 0; top: 0; will-change: transform; }
.canvas-edge {
  position: absolute;
  height: 1.5px;
  transform-origin: 0 50%;
  pointer-events: none;
  border-radius: 2px;
}

.mnode {
  position: absolute;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 0 12px 0 9px;
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: 0 1px 2px rgba(74, 53, 32, 0.07), 0 6px 14px -8px rgba(74, 53, 32, 0.28);
  transition: box-shadow 0.18s, border-color 0.18s, opacity 0.18s, transform 0.18s;
}
.mnode:active { transform: scale(0.985); }

/* 选中：暖色描边 + 外发光，路径上的节点略淡 */
.mnode.sel {
  border-color: var(--wood-600);
  box-shadow: 0 0 0 2.5px rgba(142, 100, 56, 0.18), 0 10px 24px -10px rgba(74, 53, 32, 0.45);
}
.mnode.onPath { border-color: var(--wood-300); }
.mnode.dim { opacity: 0.32; }

/* 根节点：深木底 + 浅色字，作为整棵树的视觉起点 */
.mnode.mnode-root {
  background: linear-gradient(150deg, #7a5533, #5c3f27);
  border-color: transparent;
  box-shadow: 0 2px 6px rgba(92, 63, 39, 0.28), 0 12px 26px -14px rgba(92, 63, 39, 0.6);
}
.mnode.mnode-root .tt { color: #fbf3e8; font-family: var(--serif); font-size: 13.5px; }
.mnode.mnode-root .tm { color: rgba(255, 255, 255, 0.68); }
.mnode.mnode-root .mi { background: rgba(255, 255, 255, 0.16); color: #fbefe7; box-shadow: none; }
.mnode.mnode-root .mn-toggle {
  background: rgba(255, 255, 255, 0.22);
  border-color: rgba(255, 255, 255, 0.38);
  color: #fff;
}

/* 按类型区分层次：分类更厚、感悟更轻、备注最弱 */
.mnode.mnode-category { background: #fffcf6; }
.mnode.mnode-category .tt { font-size: 13px; font-weight: 650; }
.mnode.mnode-book .tt { font-family: var(--serif); font-size: 13px; }
.mnode.mnode-book .mi { border-radius: 3px 5px 5px 3px; }
.mnode.mnode-note { background: #fcfdfb; }
.mnode.mnode-remark { background: #fbfcfd; }
.mnode.mnode-remark .tt { font-size: 11.5px; font-weight: 450; color: var(--ink-600); }

.theme-dark .mnode.mnode-category { background: #2f2924; }
.theme-dark .mnode.mnode-note { background: #2b2723; }
.theme-dark .mnode.mnode-remark { background: #292623; }

.mi {
  flex: 0 0 25px;
  width: 25px;
  height: 25px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
}

.txt { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.tt {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.3;
  color: var(--ink-800);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tm { margin-top: 1px; font-size: 9.5px; color: var(--ink-400); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.mn-toggle {
  position: absolute;
  right: -10px;
  top: 50%;
  transform: translateY(-50%);
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink-500);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9.5px;
  line-height: 1;
  font-weight: 600;
  margin: 0;
  box-shadow: 0 1px 3px rgba(74, 53, 32, 0.14);
}

.canvas-hint {
  position: absolute;
  left: 50%;
  top: 10px;
  transform: translateX(-50%);
  font-size: 10px;
  color: var(--ink-400);
  background: rgba(255, 255, 255, 0.84);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 3px 11px;
  white-space: nowrap;
  pointer-events: none;
}
.theme-dark .canvas-hint { background: rgba(42, 37, 33, 0.86); }

.canvas-zoom {
  position: absolute;
  left: 12px;
  bottom: calc(14px + env(safe-area-inset-bottom));
  display: flex;
  align-items: center;
  gap: 7px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid var(--line-strong);
  border-radius: 9px;
  padding: 5px 10px;
  font-size: 10.5px;
  color: var(--ink-500);
  z-index: 12;
}
.theme-dark .canvas-zoom { background: rgba(42, 37, 33, 0.95); }
.zoom-num { color: var(--ink-800); font-weight: 600; font-size: 11.5px; }

.has-selection .canvas-tools { bottom: 72px; }

.canvas-tools {
  position: absolute;
  right: 12px;
  top: 48px;
  z-index: 12;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.canvas-tool {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  border: 1px solid var(--line-strong);
  background: rgba(255, 255, 255, 0.95);
  color: var(--ink-600);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
  box-shadow: 0 2px 6px rgba(74, 53, 32, 0.1);
}
.theme-dark .canvas-tool { background: rgba(42, 37, 33, 0.95); }

.node-bar {
  position: absolute;
  left: 10px;
  width: calc(50% - 15px);
  right: auto;
  bottom: calc(64px + env(safe-area-inset-bottom));
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 9px;
  background: rgba(251, 248, 241, 0.98);
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  padding: 9px 10px;
  box-shadow: 0 8px 24px -10px rgba(74, 53, 32, 0.45);
  transform: translateY(150%);
}
.theme-dark .node-bar { background: rgba(42, 37, 33, 0.98); }
.node-bar.on { transform: translateY(0); transition: transform 0.24s ease; }
.node-bar .nb-go { margin-left: auto; }

.nb-ic {
  flex: 0 0 28px;
  width: 28px;
  height: 28px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.nb-main { min-width: 0; flex: 1; display: flex; flex-direction: column; }
.nb-t { font-size: 12px; font-weight: 650; color: var(--ink-800); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nb-m { font-size: 10px; color: var(--ink-400); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.nb-go {
  flex: 0 0 auto;
  height: 30px;
  padding: 0 13px;
  border-radius: 999px;
  border: 0;
  background: var(--wood-700);
  color: #fff;
  font-size: 11.5px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin: 0;
  line-height: 30px;
}

.error-tip {
  margin: 6px 16px 10px;
  padding: 9px 12px;
  border-radius: 9px;
  background: var(--red-100);
  color: var(--red-700);
  font-size: 12px;
}
</style>
