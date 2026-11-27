<template>
  <AppPage class="category-page" :loading="loading" skeleton="shelf" :shelf-columns="perRow" :title="category?.title || '分类'" :subtitle="subtitle" :before-back="backToParent" back>
    <template #action>
      <SortMenu :options="sortOptions" :index="sortIndex" @change="setSort" />
    </template>
    <template #path>
      <text class="link" @click="goHome">我的书架</text>
      <template v-for="ancestor in categoryPath.slice(0, -1)" :key="ancestor.id">
        <text class="sep">/</text>
        <text class="link" @click="openCategory(ancestor.id)">{{ ancestor.title }}</text>
      </template>
      <text class="sep">/</text>
      <text class="cur">{{ category?.title || '分类' }}</text>
    </template>

    <scroll-view class="scroll" scroll-y>
      <view v-if="error" class="error-tip">{{ error }}</view>
      <view v-if="category && !loading" class="shelf-row shelf-grid" :style="{ gridTemplateColumns: 'repeat(' + perRow + ', minmax(0, 1fr))' }">
        <button
          v-for="node in shelfCards"
          :key="node.id"
          class="book"
          :aria-label="node.title + ' · ' + summaryOf(node)"
          @click="openItem(node)"
          @touchstart="press.onTouchStart($event, () => openMenu(node))"
          @touchmove="press.onTouchMove"
          @touchend="press.onTouchEnd"
          @touchcancel="press.onTouchEnd"
          @contextmenu.prevent="openMenu(node)"
        >
          <view class="cover-wrap">
            <BookCover
              :title="node.title"
              :author="authorOf(node)"
              :color="paletteOf(node).color"
              :art="paletteOf(node).art"
              :image="coverImage(node)"
              :ribbon="node.nodeType === 'book' && inProgress(node)"
            />
            <view v-if="menuNode?.id === node.id && menuOpen" class="longpress-hint" />
            <view class="book-overlay">
              <text class="ol-title">{{ node.title }}</text>
              <text class="ol-sub">{{ summaryOf(node) }}</text>
            </view>
          </view>
        </button>
        <button class="book" aria-label="添加书本或分类" @click="openCreate">
          <view class="add-tile">
            <AppIcon name="plus" :size="22" />
            <text>添加</text>
          </view>
        </button>
      </view>
    </scroll-view>

    <template #footer><AppTabbar current="shelf" /></template>

    <AppSheet v-model="menuOpen" :title="menuNode?.title || '操作'" :subtitle="menuSubtitle">
      <view class="menu-head">
        <view class="menu-cover">
          <BookCover
            v-if="menuNode"
            :title="menuNode.title"
            :author="authorOf(menuNode)"
            :color="paletteOf(menuNode).color"
            :art="paletteOf(menuNode).art"
            :image="coverImage(menuNode)"
          />
        </view>
        <view class="grow">
          <text class="menu-title">{{ menuNode?.title }}</text>
          <text class="tiny">{{ menuSubtitle }}</text>
        </view>
      </view>
      <button class="btn line sheet-btn" @click="editItem">
        <AppIcon name="edit" :size="13" />{{ menuIsCategory ? '编辑分类' : '编辑书本信息' }}
      </button>
      <CategoryPicker v-if="!menuIsCategory" label="移动书本到其他分类" @update:model-value="moveBook" />
      <button class="btn line sheet-btn danger" @click="removeItem">
        <AppIcon name="trash" :size="13" />{{ menuIsCategory ? '删除分类' : '删除书本' }}
      </button>
    </AppSheet>
    <AppToast />
</AppPage>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onBackPress, onLoad, onShow } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import AppToast from '../../components/AppToast.vue'
import AppTabbar from '../../components/AppTabbar.vue'
import AppIcon from '../../components/AppIcon.vue'
import AppSheet from '../../components/AppSheet.vue'
import CategoryPicker from '../../components/CategoryPicker.vue'
import BookCover from '../../components/BookCover.vue'
import SortMenu from '../../components/SortMenu.vue'
import { contentCover, coverImage } from '../../shared/covers'
import { ROUTES, goHome, redirect, routeForEdit, routeForNode } from '../../shared/navigation'
import { breadcrumbOf, fetchNodePage, removeNode, useBookStore } from '../../shared/store'
import type { BookNode } from '../../shared/types'
import { parseContent } from '../../shared/types'
import { pageOption, requireLogin, saveNode } from '../../shared/use-book'
import { toast } from '../../shared/toast'
import { usePerRow } from '../../shared/use-per-row'
import { useLongPress } from '../../shared/use-longpress'

const store = useBookStore()
const categoryId = ref('')
const tree = ref<BookNode[]>([])
const loading = ref(true)
const error = ref('')
const menuOpen = ref(false)
const menuNode = ref<BookNode>()
const perRow = usePerRow()
const press = useLongPress()

const category = computed(() => tree.value.find(node => node.id === categoryId.value))
const categoryPath = computed(() => breadcrumbOf(tree.value, categoryId.value))
const children = computed(() => tree.value.filter(node => node.parentId === categoryId.value))
const subcategories = computed(() => children.value.filter(node => node.nodeType === 'category'))
const totals = computed(() => ({
  categories: subcategories.value.length,
  books: books.value.length,
  notes: books.value.reduce((count, book) => count + (book.childCount || 0), 0)
}))
const sortOptions = ['最近阅读', '感悟数', '书名']
const sortIndex = ref(0)

/** 排序切换：0 最近阅读 / 1 感悟数 / 2 书名。 */
function setSort(index: number) {
  sortIndex.value = index
}
const books = computed(() => children.value
  .filter(node => node.nodeType === 'book')
  .sort((a, b) => {
    const byTitle = a.title.localeCompare(b.title, 'zh')
    if (sortIndex.value === 2) return byTitle
    if (sortIndex.value === 1) return noteCount(b) - noteCount(a) || byTitle
    return readingTime(b) - readingTime(a) || byTitle
  }))

function readingTime(node: BookNode) {
  return Number(uni.getStorageSync('book-last-read:' + store.account.value + ':' + node.id)) || 0
}

/** 顶栏副标题：N 本 · M 条感悟。 */
const subtitle = computed(() => {
  const { categories, books, notes } = totals.value
  return `${categories ? categories + ' 个子分类 · ' : ''}${books} 本 · ${notes} 条感悟`
})

/** 子分类排在书本前面，共用同一网格。 */
const shelfCards = computed(() => [...subcategories.value, ...books.value])
const menuIsCategory = computed(() => menuNode.value?.nodeType === 'category')
const menuSubtitle = computed(() => menuNode.value ? summaryOf(menuNode.value) : '')

/** 通过副标题区分分类与书本。 */
function summaryOf(node: BookNode) {
  return node.nodeType === 'category'
    ? `分类 · ${node.childCount || 0} 项`
    : `${authorOf(node) || '未填写作者'} · ${noteCount(node)} 条感悟`
}

function authorOf(node: BookNode) {
  return parseContent(node).author || ''
}

function paletteOf(node: BookNode) {
  return contentCover(parseContent(node))
}

/** 阅读进度 0–100，介于 0 与 100 之间时显示书签丝带。 */
function inProgress(node: BookNode) {
  const progress = parseContent(node).progress
  return typeof progress === 'number' && progress > 0 && progress < 100
}

function noteCount(node: BookNode) {
  return (node.childCount || 0)
}

/** 打开网格中的书本或子分类。 */
function openItem(node: BookNode) {
  // 刚触发过长按或菜单正开着时，这次点击不跳转
  if (press.consumeLongPress() || menuOpen.value) { menuOpen.value = false; return }
  if (node.nodeType === 'category') openCategory(node.id)
  else uni.navigateTo({ url: routeForNode(node) })
}

function openMenu(node: BookNode) {
  menuNode.value = node
  menuOpen.value = true
}

function openCategory(id: string) {
  // 替换当前分类页，深层浏览不会耗尽 App 的页面栈。
  redirect(`${ROUTES.category}?id=${id}`)
}

function backToParent() {
  const parent = category.value?.parentId
  if (!parent) return true
  openCategory(parent)
  return false
}

onBackPress(event => event.from === 'backbutton' && !backToParent())

function openCreate() {
  uni.navigateTo({ url: `${ROUTES.create}?kind=book&parentId=${categoryId.value}` })
}

/** 使用卡片类型打开已有的编辑页。 */
function editItem() {
  const node = menuNode.value
  menuOpen.value = false
  if (node) uni.navigateTo({ url: routeForEdit(node) })
}

/** 移动书本到所选分类。 */
async function moveBook(parentId: string | null) {
  const node = menuNode.value
  if (!node || !parentId || parentId === node.parentId) return
  menuOpen.value = false
  try {
    await saveNode({ ...node, parentId }, node.contentJson ?? null)
    toast('已移动书本')
    await load()
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '移动失败')
  }
}
/** 确认后删除选中的卡片及其下级内容。 */
async function removeItem() {
  const node = menuNode.value
  menuOpen.value = false
  if (!node) return
  const isCategory = node.nodeType === 'category'
  const confirmed = await new Promise<boolean>(resolve => {
    uni.showModal({
      title: isCategory ? `删除「${node.title}」？` : `删除《${node.title}》？`,
      content: noteCount(node) ? (isCategory ? '下级分类、书本及其内容会一并删除' : '感悟及其备注会一并删除') : '删除后无法恢复',
      confirmText: '确认删除',
      success: result => resolve(result.confirm),
      fail: () => resolve(false)
    })
  })
  if (!confirmed) return
  try {
    await removeNode(node.id)
    toast('已删除')
    await load()
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '删除失败')
  }
}

async function load() {
  if (!store.token.value) return
  loading.value = true
  error.value = ''
  try {
    tree.value = await fetchNodePage(categoryId.value, rows => { tree.value = rows; loading.value = false })
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onLoad(options => {
  categoryId.value = pageOption('id', (options?.id as string) || '')
  requireLogin()
})
onShow(() => {
  if (store.token.value) void load()
})
</script>

<style scoped>
.category-page :deep(.sk-plank) { display: none; }
.category-page :deep(.sk-shelf-row) { margin-bottom: 18px; }
.scroll {
  flex: 1;
  min-height: 0;
  padding: 0 11px 8px;
  box-sizing: border-box;
}

.book { display: block; width: 100%; padding: 0; border: 0; background: none; margin: 0; text-align: center; }
.shelf-grid { padding-bottom: 12px; }
.book-cover :deep(img) { width: 100%; height: 100%; object-fit: cover; }
.cover-wrap { position: relative; }
.longpress-hint { position: absolute; inset: 0; border-radius: 4px 7px 7px 4px; box-shadow: 0 0 0 2px var(--wood-500); pointer-events: none; }
.book-overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 16px 9px 9px;
  border-radius: 0 0 6px 3px;
  background: linear-gradient(180deg, transparent 0%, rgba(24, 18, 14, 0.5) 46%, rgba(24, 18, 14, 0.82) 100%);
  pointer-events: none;
}

.book-overlay .ol-title {
  font-family: var(--serif);
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.4;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.book-overlay .ol-sub {
  font-size: 10px;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.88);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.menu-head { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
.menu-cover { width: 52px; flex: 0 0 52px; }
.menu-title { display: block; font-family: var(--serif); font-size: 16px; font-weight: 600; }

.error-tip {
  margin: 6px 4px 10px;
  padding: 9px 12px;
  border-radius: 9px;
  background: var(--red-100);
  color: var(--red-700);
  font-size: 12px;
}

.danger { color: var(--red-700); }
.sheet-btn { width: 100%; }
</style>
