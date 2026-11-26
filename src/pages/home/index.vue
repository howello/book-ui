<template>
  <AppPage :loading="loading" skeleton="shelf" :shelf-columns="perRow" title="我的书架" :show-nav="true">
    <!-- 排序放左上角 -->
    <template #action-left>
      <SortMenu :options="sortLabels" :index="sortIndex" align="left" @change="setSort" />
    </template>
    <template #action>
      <button class="act-text icon-btn" aria-label="新建分类" @click="openCreate">
        <AppIcon name="plus" :size="20" />
      </button>
    </template>

    <view class="stats-line">
      <text class="tiny">{{ statsText }}</text>
    </view>

    <scroll-view class="scroll" scroll-y>
      <view v-if="error" class="error-tip">{{ error }}</view>

      <view v-else-if="!categories.length && !loading" class="empty">
        <AppIcon name="folder" :size="34" />
        <text class="empty-text">还没有分类，先建一个吧</text>
      </view>

      <view v-else class="shelf">
        <template v-for="(row, rowIndex) in shelfRows" :key="rowIndex">
          <view class="shelf-row" :style="{ gridTemplateColumns: 'repeat(' + perRow + ', minmax(0, 1fr))' }">
            <button
              v-for="item in row"
              :key="item.key"
              class="cat"
              @click="item.add ? openCreate() : openCategory(item.node!)"
              @touchstart="item.node && press.onTouchStart($event, () => openMenu(item.node!))"
              @touchmove="press.onTouchMove"
              @touchend="press.onTouchEnd"
              @touchcancel="press.onTouchEnd"
            >
              <template v-if="item.add">
                <view class="add-tile">
                  <AppIcon name="plus" :size="22" />
                  <text>新建分类</text>
                </view>
              </template>
              <template v-else>
                <view class="cat-stack" />
                <view class="cat-cover" :style="{ background: paletteOf(item.node!).bg }">
                  <AppImage v-if="coverImage(item.node!)" class="cat-image" :src="coverImage(item.node!)" mode="aspectFill" fill />
                  <view class="cat-spine" />
                  <view class="cat-face" :class="{ 'on-image': !!coverImage(item.node!) }">
                    <text class="cat-name" :style="coverImage(item.node!) ? {} : { color: paletteOf(item.node!).ink }">{{ item.node!.title }}</text>
                    <text class="cat-count" :style="coverImage(item.node!) ? {} : { color: paletteOf(item.node!).ink }">
                      {{ countsOf(item.node!).books }} 本 · {{ describe(item.node!) }}
                    </text>
                  </view>
                </view>
              </template>
            </button>
          </view>
          <view class="shelf-plank" />
        </template>
      </view>
    </scroll-view>

    <template #footer><AppTabbar current="shelf" /></template>

    <!-- 分类长按菜单 -->
    <AppSheet v-model="menuOpen" :title="menuNode?.title || '分类'" subtitle="分类自身的操作">
      <button class="btn line sheet-btn" @click="editCategory">
        <AppIcon name="edit" :size="13" />编辑分类
      </button>
      <button class="btn line sheet-btn" @click="menuToast('新建子分类：分类可继续嵌套')">
        <AppIcon name="layers" :size="13" />新建子分类
      </button>
      <button class="btn line sheet-btn danger" @click="removeCategory">
        <AppIcon name="trash" :size="13" />删除分类
      </button>
    </AppSheet>

    <!-- 新建分类抽屉 -->
    <AppToast />
</AppPage>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import AppToast from '../../components/AppToast.vue'
import AppTabbar from '../../components/AppTabbar.vue'
import AppIcon from '../../components/AppIcon.vue'
import AppImage from '../../components/AppImage.vue'
import AppSheet from '../../components/AppSheet.vue'
import SortMenu from '../../components/SortMenu.vue'
import CoverFinder from '../../components/CoverFinder.vue'
import { COVERS, COVER_KEYS, contentCover, coverImage, coverPalette, joinCoverRef } from '../../shared/covers'
import { bookStoragePrefix } from '../../api-env'
import { ROUTES } from '../../shared/navigation'
import { childCount, hydrate, readCachedNodes, refreshNodes, removeNode, shelfStats, useBookStore } from '../../shared/store'
import type { BookNode } from '../../shared/types'
import { parseContent, stringifyContent } from '../../shared/types'
import { saveNode } from '../../shared/use-book'
import { requireLogin } from '../../shared/use-book'
import { toast as showToast } from '../../shared/toast'
import { chunk, usePerRow } from '../../shared/use-per-row'
import { useLongPress } from '../../shared/use-longpress'

const store = useBookStore()
const tree = ref<BookNode[]>([])
const loading = ref(true)
const error = ref('')
const menuOpen = ref(false)
const menuNode = ref<BookNode>()
const createOpen = ref(false)
const finderOpen = ref(false)
const saving = ref(false)

const perRow = usePerRow()
const press = useLongPress()

const form = reactive({ title: '', desc: '', color: 'plum' })

/** 分类排序方式：时间 / 数量 / 名称。 */
const sortLabels = ['按时间', '按数量', '按名称']
const sortStorageKey = bookStoragePrefix + '-shelf-sort'
/**
 * 排序索引：0 时间 / 1 数量 / 2 名称。
 * 默认按数量；uni 读不到时返回空串，需显式判断，不能直接 Number()。
 */
const savedSort = uni.getStorageSync(sortStorageKey)
const sortIndex = ref(savedSort === '' || savedSort == null ? 1 : Number(savedSort))

/** 切换排序方式并记住选择。 */
function setSort(index: number) {
  sortIndex.value = index
  uni.setStorageSync(sortStorageKey, index)
}

/** 分类下书本数量（排序用）。 */
function bookCountOf(node: BookNode) {
  return tree.value.filter(item => item.parentId === node.id && item.nodeType === 'book').length
}

/**
 * 分类列表，按当前排序方式排好。
 *
 * - 按时间：更新时间倒序（最近改过的在前）
 * - 按数量：书本数量倒序（多的在前），相同按名称
 * - 按名称：中文拼音序
 */
const categories = computed(() => {
  const list = tree.value.filter(node => node.nodeType === 'category')
  return [...list].sort((a, b) => {
    if (sortIndex.value === 1) {
      return bookCountOf(b) - bookCountOf(a) || a.title.localeCompare(b.title, 'zh')
    }
    if (sortIndex.value === 2) {
      return a.title.localeCompare(b.title, 'zh')
    }
    // 按时间：updatedAt 缺失时回退 createdAt
    const ta = a.updatedAt || a.createdAt || ''
    const tb = b.updatedAt || b.createdAt || ''
    return tb.localeCompare(ta) || a.title.localeCompare(b.title, 'zh')
  })
})

/** 顶部统计：N 个分类 · M 本书 · 本周记了 K 条。 */
const stats = computed(() => shelfStats(tree.value))
const statsText = computed(() => `${stats.value.categories} 个分类 · ${stats.value.books} 本书 · 本周记了 ${stats.value.weekNotes} 条`)

/** 书架卡片：分类 + 末尾「新建」虚线卡。 */
const shelfCards = computed(() => [
  ...categories.value.map(node => ({ key: node.id, node, add: false })),
  { key: '__add', node: undefined, add: true }
])

/** 按每行 2/4 个分组，层板只托住这一行实际卡片。 */
const shelfRows = computed(() => chunk(shelfCards.value, perRow.value))

/** 分组（分类）下书本计数与感悟计数。 */
function countsOf(node: BookNode) {
  const books = tree.value.filter(item => item.parentId === node.id && item.nodeType === 'book')
  let notes = 0
  for (const book of books) notes += childCount(tree.value, book.id, 'note')
  return { books: books.length, notes }
}

/** 分类卡第二行：说明优先，没有说明时显示感悟数。 */
function describe(node: BookNode) {
  const desc = parseContent(node).desc
  if (desc) return desc
  const counts = countsOf(node)
  return `${counts.notes} 条感悟`
}

function paletteOf(node: BookNode) {
  const { color } = contentCover(parseContent(node))
  return coverPalette(color)
}

function toast(message: string) {
  showToast(message)
}

function menuToast(message: string) {
  menuOpen.value = false
  toast(message)
}

function openCategory(node: BookNode) {
  // 刚触发过长按时，这次点击不跳转
  if (press.consumeLongPress()) return
  uni.navigateTo({ url: `${ROUTES.category}?id=${node.id}` })
}

function openMenu(node: BookNode) {
  menuNode.value = node
  menuOpen.value = true
}

function openCreate() {
  uni.navigateTo({ url: ROUTES.create + '?kind=category' })
}

function editCategory() {
  const node = menuNode.value
  menuOpen.value = false
  if (node) uni.navigateTo({ url: `${ROUTES.categoryEdit}?id=${node.id}` })
}

async function removeCategory() {
  const node = menuNode.value
  menuOpen.value = false
  if (!node) return
  const counts = countsOf(node)
  const confirmed = await new Promise<boolean>(resolve => {
    uni.showModal({
      title: `删除「${node.title}」？`,
      content: counts.books ? `分类下还有 ${counts.books} 本书，会一并删除` : '删除后无法恢复',
      confirmText: '确认删除',
      success: result => resolve(result.confirm),
      fail: () => resolve(false)
    })
  })
  if (!confirmed) return
  try {
    await removeNode(node.id)
    toast('已删除')
    await refreshing
    await load()
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '删除失败')
  }
}

let loadedFor: string | undefined
let refreshing: Promise<void> | undefined

function load() {
  if (!refreshing) refreshing = refreshShelf().finally(() => { refreshing = undefined })
  return refreshing
}

async function refreshShelf() {
  const token = store.token.value
  const owner = store.account.value
  if (!token) return
  const currentSession = () => token === store.token.value && owner === store.account.value
  const cached = readCachedNodes({ tree: true })
  if (cached !== undefined) {
    tree.value = cached
    loadedFor = owner
  } else if (loadedFor !== owner) {
    tree.value = []
  }
  loading.value = loadedFor !== owner
  error.value = ''
  try {
    const fresh = await refreshNodes({ tree: true })
    if (currentSession()) {
      tree.value = fresh
      loadedFor = owner
      void hydrate(tree.value.filter(node => node.nodeType === 'category'))
    }
  } catch (failure) {
    if (currentSession() && loadedFor !== owner) {
      error.value = failure instanceof Error ? failure.message : '加载失败'
    }
  } finally {
    if (!currentSession()) {
      tree.value = []
      loadedFor = undefined
      requireLogin()
    }
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
.cat-image { position: absolute; inset: 0; width: 100%; height: 100%; display: block; z-index: 0; }
.cat-image :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.scroll {
  flex: 1;
  min-height: 0;
  padding: 0 11px 8px;
  box-sizing: border-box;
}

.stats-line {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 15px 6px;
  background: var(--paper);
}

.error-tip {
  margin: 6px 4px 10px;
  padding: 9px 12px;
  border-radius: 9px;
  background: var(--red-100);
  color: var(--red-700);
  font-size: 12px;
}

.navbar .nav-action { gap: 8px; }

.cat { display: block; width: 100%; padding: 0; border: 0; background: none; margin: 0; }

.cat-name {
  font-family: var(--serif);
  font-size: 15.5px;
  font-weight: 600;
  line-height: 1.35;
  color: #fff;
}

.cat-count {
  margin-top: 3px;
  font-size: 10.5px;
  opacity: 0.9;
  color: #fff;
}

/* 有封面图时：文字压在图片下部，加深色蒙层保证可读 */
.cat-face.on-image {
  justify-content: flex-end;
  padding: 0;
  background: linear-gradient(180deg, transparent 42%, rgba(24, 18, 14, 0.42) 68%, rgba(24, 18, 14, 0.78) 100%);
}

.cat-face.on-image .cat-name,
.cat-face.on-image .cat-count {
  position: relative;
  z-index: 2;
  padding: 0 12px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.cat-face.on-image .cat-name { padding-bottom: 2px; }
.cat-face.on-image .cat-count { padding-bottom: 12px; opacity: 0.92; }

.find-btn { margin-top: 9px; }

.danger { color: var(--red-700); }

.sheet-btn { width: 100%; }
</style>
