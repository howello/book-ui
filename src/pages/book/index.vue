<template>
  <AppPage :loading="loading" skeleton="detail" :title="book?.title || '书本'" :subtitle="content.author || ''" back>
    <template #action>
      <button class="act" aria-label="编辑书本" @click="editBook">
        <AppIcon name="edit" :size="20" />
      </button>
    </template>
    <template #path>
      <text class="link" @click="goHome">我的书架</text>
      <template v-for="ancestor in categoryPath" :key="ancestor.id">
        <text class="sep">/</text>
        <text class="link" @click="openCategory(ancestor.id)">{{ ancestor.title }}</text>
      </template>
      <text class="sep">/</text>
      <text class="cur">{{ book?.title || '书本' }}</text>
    </template>

    <scroll-view class="scroll" scroll-y>
      <view v-if="error" class="error-tip">{{ error }}</view>

      <!-- 书籍信息头 -->
      <view v-if="book" class="book-hero">
        <view class="cover">
          <AppImage v-if="coverImage(book)" class="cover-image" :src="coverImage(book)" mode="aspectFill" fill />
          <view v-else class="cover-face" :style="{ background: palette.bg, color: palette.ink }">
            <text class="t">{{ book.title }}</text>
            <text class="a">{{ content.author || '' }}</text>
          </view>
        </view>
        <view class="info">
          <h2>{{ book.title }}</h2>
          <text class="author">{{ metaLine }}</text>
          <view class="stats">
            <view class="stat"><text class="num">{{ notes.length }}</text>感悟</view>
            <view class="stat"><text class="num">{{ remarkCount }}</text>备注</view>
            <view class="stat"><text class="num">{{ content.pages || '—' }}</text>页</view>
          </view>
          <view class="progress"><view class="bar" :style="{ width: progressPercent + '%' }" /></view>
          <text class="tiny progress-note">{{ progressText }}</text>
          <view class="actions">
            <button v-if="tags.length" class="btn xs line" @click="toast('标签：' + tags.join(' / '))">
              {{ tags.slice(0, 2).join(' · ') }}{{ tags.length > 2 ? ' +' + (tags.length - 2) : '' }}
            </button>
            <button class="btn xs line" @click="exportBook">
              <AppIcon name="upload" :size="12" />导出
            </button>
          </view>
        </view>
      </view>

      <!-- 筛选条：类型筛选 + 排序 -->
      <view class="filter-row">
        <button class="filter" :class="{ on: filter === 'all' }" @click="filter = 'all'">全部 {{ notes.length }}</button>
        <button class="filter" :class="{ on: filter === 'image' }" @click="toggleFilter('image')">含图片 {{ imageCount }}</button>
        <button class="filter" :class="{ on: filter === 'audio' }" @click="toggleFilter('audio')">含语音 {{ audioCount }}</button>
        <SortMenu class="filter-picker" :options="sortLabels" :index="sortIndex" @change="setSort" />
      </view>

      <!-- 章节筛选：只有存在章节时才出现 -->
      <view v-if="chapters.length > 1" class="chapter-row">
        <button
          v-for="chapter in chapterFilters"
          :key="chapter || '__all'"
          class="chapter-chip"
          :class="{ on: activeChapter === chapter }"
          @click="activeChapter = chapter"
        >
          {{ chapter || '全部章节' }}
        </button>
      </view>

      <view class="section-title">
        <text>感悟 · {{ visibleNotes.length }} 条</text>
      </view>

      <view v-if="!visibleNotes.length && !loading" class="empty">
        <AppIcon name="quote" :size="32" />
        <text class="empty-text">{{ notes.length ? '没有符合条件的感悟' : '还没有感悟，写下第一条吧' }}</text>
      </view>

      <button v-for="(note, index) in visibleNotes" :key="note.id" class="entry" @click="openNote(note)">
        <view class="entry-hd">
          <text class="date">{{ dateOf(note) }}</text>
          <text class="idx">#{{ visibleNotes.length - index }}</text>
          <view class="grow" />
          <text class="tiny chapter">{{ statsOf(note).chapter || '' }}</text>
        </view>
        <text class="entry-title">{{ note.title }}</text>
        <text class="entry-text">{{ statsOf(note).summary }}</text>
        <view class="entry-foot">
          <text v-for="tag in parseContent(note).tags || []" :key="tag" class="chip">{{ tag }}</text>
          <view v-if="statsOf(note).text" class="chip"><AppIcon name="text" :size="12" /><text>{{ statsOf(note).text }} 段</text></view>
          <view v-if="statsOf(note).images" class="chip"><AppIcon name="image" :size="12" /><text>{{ statsOf(note).images }} 图</text></view>
          <view v-if="statsOf(note).audios" class="chip"><AppIcon name="mic" :size="12" /><text>语音</text></view>
          <view v-if="statsOf(note).quotes" class="chip"><AppIcon name="quote" :size="12" /><text>引用 {{ statsOf(note).quotes }}</text></view>
          <view v-if="remarkCountOf(note)" class="chip"><AppIcon name="corner" :size="12" /><text>{{ remarkCountOf(note) }} 备注</text></view>
        </view>
      </button>

      <text v-if="visibleNotes.length" class="tiny list-tail">已经到底了</text>
    </scroll-view>

    <template #footer>
      <view class="book-footer">
        <AppTabbar current="shelf" />
        <button class="fab-round" aria-label="写一条感悟" @click="writeNote">
          <AppIcon name="plus" :size="24" />
        </button>
      </view>
    </template>
    <AppToast />
</AppPage>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import AppToast from '../../components/AppToast.vue'
import AppIcon from '../../components/AppIcon.vue'
import AppImage from '../../components/AppImage.vue'
import AppTabbar from '../../components/AppTabbar.vue'
import SortMenu from '../../components/SortMenu.vue'
import { contentCover, coverImage, coverPalette } from '../../shared/covers'
import { ROUTES, goHome } from '../../shared/navigation'
import { ancestorsOf, fetchNodePage, fetchSubtree, useBookStore } from '../../shared/store'
import type { BookNode } from '../../shared/types'
import { parseContent } from '../../shared/types'
import { noteStats, pageOption, requireLogin } from '../../shared/use-book'
import { bookMarkdown, saveMarkdown } from '../../shared/export-markdown'
import { toast } from '../../shared/toast'

const store = useBookStore()
const bookId = ref('')
const tree = ref<BookNode[]>([])
const loading = ref(true)
const error = ref('')
const filter = ref<'all' | 'chapter' | 'image' | 'audio'>('all')

const book = computed(() => tree.value.find(node => node.id === bookId.value))
const content = computed(() => parseContent(book.value))
const categoryPath = computed(() => ancestorsOf(tree.value, bookId.value).reverse())
const palette = computed(() => coverPalette(contentCover(content.value).color))

const notes = computed(() => tree.value
  .filter(node => node.parentId === bookId.value && node.nodeType === 'note')
  .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '') || (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))

const remarkCount = computed(() => {
  let total = 0
  for (const note of notes.value) total += remarkCountOf(note)
  return total
})

/** 排序：最新 / 最早 / 按章节。 */
const sortLabels = ['最新 ↓', '最早 ↑', '按章节']
const sortIndex = ref(0)

/** 排序切换：0 最新 / 1 最早 / 2 按章节。 */
function setSort(index: number) {
  sortIndex.value = index
}
/** 当前选中的章节（空串表示全部）。 */
const activeChapter = ref('')

/** 感悟里出现过的章节，按出现顺序去重。 */
const chapters = computed(() => {
  const names: string[] = []
  for (const note of notes.value) {
    const chapter = statsOf(note).chapter
    if (chapter && !names.includes(chapter)) names.push(chapter)
  }
  return names
})

/** 章节筛选条：全部 + 各章节。 */
const chapterFilters = computed(() => ['', ...chapters.value])

/** 同一筛选按钮再点一次取消，回到全部。 */
function toggleFilter(kind: 'image' | 'audio') {
  filter.value = filter.value === kind ? 'all' : kind
}

const visibleNotes = computed(() => {
  const list = notes.value.filter(note => {
    if (filter.value === 'image' && statsOf(note).images === 0) return false
    if (filter.value === 'audio' && statsOf(note).audios === 0) return false
    if (activeChapter.value && statsOf(note).chapter !== activeChapter.value) return false
    return true
  })
  const copy = [...list]
  if (sortIndex.value === 1) {
    copy.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
  } else if (sortIndex.value === 2) {
    copy.sort((a, b) => (statsOf(a).chapter || '未分章节').localeCompare(statsOf(b).chapter || '未分章节', 'zh', { numeric: true }))
  }
  return copy
})

const imageCount = computed(() => notes.value.filter(note => statsOf(note).images > 0).length)
const audioCount = computed(() => notes.value.filter(note => statsOf(note).audios > 0).length)

/** 书目信息一行：作者 · 出版社 · 年份。 */
const metaLine = computed(() => {
  const parts = [content.value.author, content.value.publisher, content.value.year].filter(Boolean)
  return parts.length ? parts.join(' · ') : '未填写书目信息'
})

const tags = computed(() => (Array.isArray(content.value.tags) ? content.value.tags : []))

/** 阅读进度：以 content.progress 为准，缺省按状态推断。 */
const progressPercent = computed(() => {
  const progress = content.value.progress
  if (typeof progress === 'number') return Math.max(0, Math.min(100, progress))
  return content.value.status === '已读完' ? 100 : 0
})

const progressText = computed(() => {
  const status = content.value.status || (progressPercent.value >= 100 ? '已读完' : '在读')
  return progressPercent.value >= 100 ? '已读完' : `${status} · 已读 ${progressPercent.value}%`
})

function statsOf(note: BookNode) {
  return noteStats(note)
}

/** 感悟下的备注总数（含所有层级的子备注）。 */
function remarkCountOf(note: BookNode) {
  return note.childCount ?? 0
}

function dateOf(note: BookNode) {
  const time = note.createdAt || note.updatedAt || ''
  const date = time.slice(0, 10)
  return date || '—'
}

function openNote(note: BookNode) {
  uni.navigateTo({ url: `${ROUTES.note}?id=${note.id}` })
}

function openCategory(id: string) {
  const pages = getCurrentPages()
  const previous = pages[pages.length - 2] as { route?: string; options?: Record<string, string> } | undefined
  if (previous?.route === ROUTES.category.slice(1) && previous.options?.id === id) uni.navigateBack()
  else uni.redirectTo({ url: `${ROUTES.category}?id=${id}` })
}

/** 导出整本书的感悟与备注为 Markdown。 */
async function exportBook() {
  const node = book.value
  if (!node) return
  try {
    saveMarkdown(`${node.title}.md`, bookMarkdown(node, await fetchSubtree(node.id)))
    toast(`已导出《${node.title}》`)
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '导出失败')
  }
}

function editBook() {
  if (book.value) uni.navigateTo({ url: `${ROUTES.bookEdit}?id=${book.value.id}` })
}

function writeNote() {
  uni.navigateTo({ url: `${ROUTES.noteEdit}?parentId=${bookId.value}` })
}

async function load() {
  if (!store.token.value) return
  loading.value = true
  error.value = ''
  try {
    tree.value = await fetchNodePage(bookId.value, rows => { tree.value = rows; loading.value = false })
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onLoad(options => {
  bookId.value = pageOption('id', (options?.id as string) || '')
  if (requireLogin()) {
    if (bookId.value) uni.setStorageSync('book-last-read:' + store.account.value + ':' + bookId.value, Date.now())
    void load()
  }
})
onShow(() => {
  if (store.token.value) void load()
})
</script>

<style scoped>
.scroll {
  flex: 1;
  min-height: 0;
  padding: 0;
  box-sizing: border-box;
}

.book-hero { padding: 4px 16px 16px; }
.book-hero h2 {
  margin: 0;
  font-family: var(--serif);
  font-size: 19px;
  font-weight: 650;
  line-height: 1.35;
}
.progress-note { display: block; margin-top: 5px; }

.filter-row {
  display: flex;
  gap: 6px;
  padding: 0 16px 10px;
  overflow-x: auto;
  overflow-y: visible;
  white-space: nowrap;
  /* 下拉浮层要能溢出这一行 */
  position: relative;
  z-index: 12;
}
.filter {
  flex: 0 0 auto;
  height: 27px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink-500);
  font-size: 11.5px;
  line-height: 25px;
  margin: 0;
}
.filter.on { background: var(--wood-700); border-color: var(--wood-700); color: #fff; font-weight: 600; }
.filter-picker { flex: 0 0 auto; }

.chapter-row {
  display: flex;
  gap: 6px;
  padding: 0 16px 10px;
  overflow-x: auto;
  white-space: nowrap;
}
.chapter-chip {
  flex: 0 0 auto;
  height: 25px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--ink-500);
  font-size: 11px;
  margin: 0;
  line-height: 23px;
}
.chapter-chip.on { border-color: var(--wood-400); background: var(--wood-100); color: var(--wood-900); font-weight: 600; }

.section-title { padding: 0 16px; }

.entry { width: auto; margin: 0 16px; display: block; }
.entry + .entry { margin-top: 10px; }
.entry .entry-title { display: block; }
.entry .entry-text { display: -webkit-box; }
.entry .chapter { color: var(--wood-600); }
.entry .chip { display: inline-flex; align-items: center; gap: 4px; }

.list-tail {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  min-height: 74px;
  padding: 8px 76px 8px 16px;
}
.book-footer { position: relative; flex-shrink: 0; }

/* 右下角圆形悬浮按钮：只放 + 图标 */
.fab-round {
  position: absolute;
  right: 18px;
  bottom: calc(100% + 18px);
  z-index: 26;
  width: 56px;
  height: 56px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: var(--wood-700);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 18px -4px rgba(74, 53, 32, 0.45), 0 2px 6px rgba(74, 53, 32, 0.24);
}

.fab-round:active { transform: scale(0.94); }

.error-tip {
  margin: 6px 16px 10px;
  padding: 9px 12px;
  border-radius: 9px;
  background: var(--red-100);
  color: var(--red-700);
  font-size: 12px;
}
</style>
