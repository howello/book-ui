<template>
  <AppPage :loading="loading" skeleton="shelf" :shelf-columns="perRow" :title="category?.title || '分类'" :subtitle="subtitle" back>
    <template #action>
      <SortMenu :options="sortOptions" :index="sortIndex" @change="setSort" />
    </template>
    <template #path>
      <text class="link" @click="goHome">我的书架</text>
      <text class="sep">/</text>
      <text class="link" @click="goHome">{{ category?.title || '分类' }}</text>
      <text class="sep">/</text>
      <text class="cur">全部</text>
    </template>

    <scroll-view class="scroll" scroll-y>
      <view v-if="error" class="error-tip">{{ error }}</view>
      <view v-if="!loading" class="shelf">
        <template v-for="(group, rowIndex) in shelfRows" :key="rowIndex">
          <view class="shelf-row" :style="{ gridTemplateColumns: 'repeat(' + perRow + ', minmax(0, 1fr))' }">
            <button
              v-for="item in group"
              :key="item.key"
              class="book"
              @click="item.add ? openCreate() : openBook(item.node!)"
              @touchstart="item.node && press.onTouchStart($event, () => openMenu(item.node!))"
              @touchmove="press.onTouchMove"
              @touchend="press.onTouchEnd"
              @touchcancel="press.onTouchEnd"
            >
              <template v-if="item.add">
                <view class="add-tile">
                  <AppIcon name="plus" :size="22" />
                  <text>添加书本</text>
                </view>
              </template>
              <template v-else>
                <view class="cover-wrap">
                  <BookCover
                    :title="item.node!.title"
                    :author="authorOf(item.node!)"
                    :color="paletteOf(item.node!).color"
                    :art="paletteOf(item.node!).art"
                    :image="coverImage(item.node!)"
                    :ribbon="inProgress(item.node!)"
                  />
                  <view v-if="menuNode?.id === item.node!.id && menuOpen" class="longpress-hint" />
                  <!-- 书名与作者压在封面下部，半透明底板凸显文字 -->
                  <view class="book-overlay">
                    <text class="ol-title">{{ item.node!.title }}</text>
                    <text class="ol-sub">
                      {{ authorOf(item.node!) || '未填写作者' }} · {{ noteCount(item.node!) }} 条感悟
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

    <!-- 书本长按菜单 -->
    <AppSheet v-model="menuOpen" :title="menuNode?.title || '书本'" :subtitle="menuSubtitle">
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
      <button class="btn line sheet-btn" @click="editBook">
        <AppIcon name="edit" :size="13" />编辑书本信息
      </button>
      <button class="btn line sheet-btn" @click="moveBook">
        <AppIcon name="folder" :size="13" />移动分类
      </button>
      <button class="btn line sheet-btn danger" @click="removeBook">
        <AppIcon name="trash" :size="13" />删除书本
      </button>
    </AppSheet>

    <!-- 分类更多菜单 -->
    <AppSheet v-model="moreOpen" :title="category?.title || '分类'" subtitle="分类自身的操作">
      <button class="btn line sheet-btn" @click="editCategory">
        <AppIcon name="edit" :size="13" />编辑分类
      </button>
      <button class="btn line sheet-btn" @click="moreToast('新建子分类：分类可继续嵌套')">
        <AppIcon name="layers" :size="13" />新建子分类
      </button>
      <button class="btn line sheet-btn" @click="moreToast('导出为 Markdown：整棵分类树按层级生成标题')">
        <AppIcon name="upload" :size="13" />导出此分类
      </button>
      <button class="btn line sheet-btn danger" @click="removeCategory">
        <AppIcon name="trash" :size="13" />删除分类
      </button>
    </AppSheet>
    <AppToast />
</AppPage>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import AppToast from '../../components/AppToast.vue'
import AppTabbar from '../../components/AppTabbar.vue'
import AppIcon from '../../components/AppIcon.vue'
import AppSheet from '../../components/AppSheet.vue'
import BookCover from '../../components/BookCover.vue'
import SortMenu from '../../components/SortMenu.vue'
import { contentCover, coverImage } from '../../shared/covers'
import { ROUTES, goHome } from '../../shared/navigation'
import { childCount, fetchNodes, hydrate, removeNode, useBookStore } from '../../shared/store'
import type { BookNode } from '../../shared/types'
import { parseContent } from '../../shared/types'
import { pageOption, requireLogin, saveNode } from '../../shared/use-book'
import { toast } from '../../shared/toast'
import { chunk, usePerRow } from '../../shared/use-per-row'
import { useLongPress } from '../../shared/use-longpress'

const store = useBookStore()
const categoryId = ref('')
const tree = ref<BookNode[]>([])
const loading = ref(true)
const error = ref('')
const menuOpen = ref(false)
const menuNode = ref<BookNode>()
const moreOpen = ref(false)
const perRow = usePerRow()
const press = useLongPress()

const category = computed(() => tree.value.find(node => node.id === categoryId.value))
const sortOptions = ['最近阅读', '感悟数', '书名']
const sortIndex = ref(0)

/** 排序切换：0 最近阅读 / 1 感悟数 / 2 书名。 */
function setSort(index: number) {
  sortIndex.value = index
}
const books = computed(() => tree.value
  .filter(node => node.parentId === categoryId.value && node.nodeType === 'book')
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
  let notes = 0
  for (const book of books.value) notes += childCount(tree.value, book.id, 'note')
  return `${books.value.length} 本 · ${notes} 条感悟`
})

/** 书架卡片：书本 + 末尾「添加书本」虚线卡。 */
const shelfCards = computed(() => [
  ...books.value.map(node => ({ key: node.id, node, add: false })),
  { key: '__add', node: undefined, add: true }
])

/** 按每行 2/4 个分组，层板只托住这一行实际卡片。 */
const shelfRows = computed(() => chunk(shelfCards.value, perRow.value))

const menuSubtitle = computed(() => {
  const node = menuNode.value
  if (!node) return ''
  const author = authorOf(node)
  return `${author ? author + ' · ' : ''}${childCount(tree.value, node.id, 'note')} 条感悟`
})

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
  return childCount(tree.value, node.id, 'note')
}

function openBook(node: BookNode) {
  // 刚触发过长按或菜单正开着时，这次点击不跳转
  if (press.consumeLongPress() || menuOpen.value) { menuOpen.value = false; return }
  uni.navigateTo({ url: `${ROUTES.book}?id=${node.id}` })
}

function openMenu(node: BookNode) {
  menuNode.value = node
  menuOpen.value = true
}

function openCreate() {
  uni.navigateTo({ url: `${ROUTES.create}?kind=book&parentId=${categoryId.value}` })
}

function editBook() {
  const node = menuNode.value
  menuOpen.value = false
  if (node) uni.navigateTo({ url: `${ROUTES.bookEdit}?id=${node.id}` })
}

function editCategory() {
  moreOpen.value = false
  uni.navigateTo({ url: `${ROUTES.categoryEdit}?id=${categoryId.value}` })
}

function moreToast(message: string) {
  moreOpen.value = false
  toast(message)
}



/** 移动分类：选择另一个分类作为新父节点。 */
async function moveBook() {
  const node = menuNode.value
  menuOpen.value = false
  if (!node) return
  const targets = tree.value.filter(item => item.nodeType === 'category' && item.id !== categoryId.value)
  if (!targets.length) { toast('没有其他分类可供移动'); return }
  const selected = await new Promise<number | undefined>(resolve => {
    uni.showActionSheet({
      itemList: targets.map(item => item.title),
      success: result => resolve(result.tapIndex),
      fail: () => resolve(undefined)
    })
  })
  if (selected === undefined || !targets[selected]) return
  try {
    await saveNode({ ...node, parentId: targets[selected].id }, node.contentJson ?? null)
    toast(`已移动到「${targets[selected].title}」`)
    await load()
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '移动失败')
  }
}



async function removeBook() {
  const node = menuNode.value
  menuOpen.value = false
  if (!node) return
  const notes = noteCount(node)
  const confirmed = await new Promise<boolean>(resolve => {
    uni.showModal({
      title: `删除《${node.title}》？`,
      content: notes ? `${notes} 条感悟及其备注会一并删除` : '删除后无法恢复',
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

async function removeCategory() {
  moreOpen.value = false
  if (!category.value) return
  const confirmed = await new Promise<boolean>(resolve => {
    uni.showModal({
      title: `删除「${category.value?.title}」？`,
      content: books.value.length ? `分类下还有 ${books.value.length} 本书，会一并删除` : '删除后无法恢复',
      confirmText: '确认删除',
      success: result => resolve(result.confirm),
      fail: () => resolve(false)
    })
  })
  if (!confirmed) return
  try {
    await removeNode(categoryId.value)
    toast('已删除')
    goHome()
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '删除失败')
  }
}

async function load() {
  if (!store.token.value) return
  loading.value = true
  error.value = ''
  try {
    tree.value = await fetchNodes({ tree: true })
    // 封面配色与作者在正文里，书架卡片需要补详情
    await hydrate(tree.value.filter(node => node.nodeType === 'book' || node.nodeType === 'category'))
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onLoad(options => {
  categoryId.value = pageOption('id', (options?.id as string) || '')
  if (requireLogin()) void load()
})
onShow(() => {
  if (store.token.value) void load()
})
</script>

<style scoped>
.scroll {
  flex: 1;
  min-height: 0;
  padding: 0 11px 8px;
  box-sizing: border-box;
}

.book { display: block; width: 100%; padding: 0; border: 0; background: none; margin: 0; text-align: center; }
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
