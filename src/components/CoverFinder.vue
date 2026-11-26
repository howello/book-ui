<template>
  <AppSheet v-model="open" :title="isBook ? '查找书本' : '查找分类配图'" :subtitle="isBook
    ? '按书名查，选中后书名、作者、出版社、年份一并填入'
    : '按关键词查配图，可改词重新搜'" tall>
    <view class="fd-sources">
      <button
        v-for="(item, index) in sourceList"
        :key="item.key"
        class="fd-source"
        :class="{ on: sourceIndex === index }"
        @click="sourceIndex = index; changeSource({ detail: { value: index } })"
      >
        {{ item.label }}<text class="fd-source-note">{{ item.note }}</text>
      </button>
    </view>
    <view class="fd-search">
      <input
        v-model="keyword"
        class="input"
        :placeholder="isBook ? '书名 / 作者 / ISBN' : '如：文学 意境'"
        confirm-type="search"
        @confirm="search"
      />
      <button class="btn sm" :disabled="loading" @click="search">查找</button>
    </view>

    <view class="fd-words">
      <button v-for="word in suggestions" :key="word" class="fd-word" @click="pickWord(word)">{{ word }}</button>
    </view>

    <text class="fd-status">{{ status }}</text>

    <view v-if="loading" role="status" aria-label="正在检索">
      <view v-for="row in 3" :key="row" class="fd-placeholder" />
    </view>

    <!-- 书目结果 -->
    <view v-else-if="showBooks" class="fd-list">
      <view v-for="(item, index) in books" :key="index" class="fd-row">
        <view class="fd-thumb">
          <AppImage v-if="item.cover" :src="item.cover" mode="aspectFill" class="fd-image" fill />
          <CoverFace v-else :title="item.title || keyword" :color="paletteFor(index).color" :art="paletteFor(index).art" />
        </view>
        <view class="fd-info">
          <text class="fd-t">{{ item.title || '未命名' }}</text>
          <text class="fd-a">{{ item.author || '—' }}</text>
          <text class="fd-p">{{ item.year || '年份未知' }} · {{ item.source || '示例数据' }}</text>
          <text v-if="item.publisher || item.pages" class="fd-p">
            {{ [item.publisher, item.pages ? item.pages + ' 页' : ''].filter(Boolean).join(' · ') }}
          </text>
          <text v-if="item.isbn" class="fd-p">ISBN {{ item.isbn }}</text>
          <text v-if="item.rating && item.rating !== '0.0'" class="fd-p">评分 {{ item.rating }}</text>
          <text v-if="item.summary" class="fd-p fd-summary">{{ item.summary.slice(0, 80) }}</text>
        </view>
        <view class="fd-acts">
          <button class="fd-use" @click="useBook(item)">用这本</button>
          <button v-if="item.cover" class="fd-cover" @click="useCover(item)">仅封面</button>
        </view>
      </view>
    </view>

    <!-- 配图结果：三列网格 -->
    <view v-else class="fd-grid">
      <button v-for="(item, index) in images" :key="index" class="fd-theme" @click="useTheme(index)">
        <view class="fd-theme-img">
          <AppImage v-if="item.cover" :src="item.cover" mode="aspectFill" class="fd-image" fill />
          <CoverFace v-else :color="paletteFor(index).color" :art="paletteFor(index).art" />
        </view>
        <text class="fd-theme-n">{{ item.title || '配图' }}</text>
        <text class="fd-theme-k">{{ keyword }}</text>
      </button>
    </view>

    <view v-if="empty" class="empty">
      <AppIcon name="search" :size="30" />
      <text class="empty-text">{{ isBook ? '没有找到书目，可退出后手工填写' : '没有找到配图，可改用配色' }}</text>
    </view>
  </AppSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppSheet from './AppSheet.vue'
import AppIcon from './AppIcon.vue'
import CoverFace from './CoverFace.vue'
import AppImage from './AppImage.vue'
import { ART_KEYS, COVER_KEYS } from '../shared/covers'
import { searchCatalog, searchImages } from '../shared/use-book'
import type { CatalogItem, ImageItem } from '../shared/use-book'

/**
 * 素材查找面板：books 按书名查书目，themes 按关键词查配图。
 * 两种模式共用请求状态与结果区，选中后由父表单接收。
 */
const props = withDefaults(defineProps<{
  modelValue: boolean
  mode?: 'books' | 'themes'
  query?: string
  author?: string
}>(), { mode: 'books', query: '', author: '' })

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  pick: [payload: {
    color: string
    art: string
    name?: string
    title?: string
    author?: string
    year?: string
    publisher?: string
    translator?: string
    pages?: string
    isbn?: string
    summary?: string
    rating?: string
    tags?: string
    coverOnly?: boolean
    cover?: string
  }]
}>()

const isBook = computed(() => props.mode === 'books')
const open = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value)
})

/** 书目来源：三个能返回元信息的源；百度图片只返回封面。 */
const BOOK_SOURCES = [
  { key: 'douban-book', label: '豆瓣图书', note: '书名 / 作者 / 年份' },
  { key: 'douban-read', label: '豆瓣阅读', note: '含简介 / 评分' },
  { key: 'weread', label: '微信读书', note: '封面 / 作者 / 评分' },
  { key: 'openlibrary', label: 'Open Library', note: '英文书较全' },
  { key: 'google-books', label: 'Google Books', note: '含简介' },
  { key: 'images', label: '图片检索', note: '仅封面' }
]
const THEME_SOURCES = [
  { key: 'auto', label: '图片检索', note: '必应优先' },
  { key: 'bing', label: '必应图片', note: '图多、质量好' },
  { key: 'so360', label: '360 图片', note: '中文覆盖好' }
]

const sourceIndex = ref(0)
const sourceList = computed(() => isBook.value ? BOOK_SOURCES : THEME_SOURCES)
const sources = computed(() => sourceList.value.map(item => item.key))
const sourceLabels = computed(() => sourceList.value.map(item => item.label))
// 只有真正的书目来源才显示书本列表；图片类来源（images / auto / bing / so360）走网格
const IMAGE_SOURCES = ['images', 'auto', 'bing', 'so360']
const showBooks = computed(() => isBook.value && !IMAGE_SOURCES.includes(sources.value[sourceIndex.value]))

function changeSource(event: { detail: { value: string | number } }) {
  sourceIndex.value = Number(event.detail.value)
  void search()
}

const keyword = ref('')
const loading = ref(false)
const status = ref('')
const books = ref<CatalogItem[]>([])
const images = ref<ImageItem[]>([])
const empty = ref(false)
let sequence = 0

/** 关键词建议：书给检索变体，分类给「分类名 + 意境」组合。 */
const suggestions = computed(() => {
  const base = (props.query || '').trim()
  if (isBook.value) {
    return base ? [base, base + ' 原版', base + ' 精装', base + ' 全集'] : ['三体', '活着', '百年孤独']
  }
  const name = base || '分类'
  return ['意境', '封面', '静物', '书卷', '纸纹', '留白'].map(word => `${name} ${word}`)
})

/** 结果没有携带配色时，按序号稳定分配一套，保证同一结果每次一致。 */
function paletteFor(index: number) {
  return {
    color: COVER_KEYS[index % COVER_KEYS.length],
    art: ART_KEYS[(index + 1) % ART_KEYS.length]
  }
}

watch(() => props.modelValue, value => {
  sequence++
  loading.value = false
  if (!value) return
  sourceIndex.value = 0
  keyword.value = props.query || ''
  books.value = []
  images.value = []
  empty.value = false
  void search()
})

async function search() {
  const current = ++sequence
  loading.value = false
  books.value = []
  images.value = []
  empty.value = false
  const query = keyword.value.trim()
  if (!query) { status.value = '请输入关键词'; return }
  loading.value = true
  empty.value = false
  status.value = '搜索中…'
  try {
    if (showBooks.value) {
      const result = await searchCatalog(query, sources.value[sourceIndex.value])
      if (current !== sequence) return
      books.value = Array.isArray(result) ? result : []
      empty.value = !books.value.length
      status.value = books.value.length
        ? `共 ${books.value.length} 个候选 · 数据来自 ${books.value[0]?.source || '在线书目'}`
        : '没有找到结果'
    } else {
      const source = sources.value[sourceIndex.value]
      const result = source === 'images'
        ? await searchImages(query)
        : source === 'auto' || source === 'bing' || source === 'so360'
          ? await searchImages(query, source)
          : (await searchCatalog(query, source)).filter(item => item.cover)
      if (current !== sequence) return
      images.value = Array.isArray(result) ? result : []
      empty.value = !images.value.length
      status.value = images.value.length ? `共 ${images.value.length} 张配图` : '没有找到结果'
    }
  } catch (failure) {
    if (current !== sequence) return
    books.value = []
    images.value = []
    empty.value = false
    status.value = failure instanceof Error ? failure.message : '检索失败'
  } finally {
    if (current === sequence) loading.value = false
  }
}

function pickWord(word: string) {
  keyword.value = word
  void search()
}

/** 「用这本」：回填全部书目字段。 */
function useBook(item: CatalogItem) {
  const index = books.value.indexOf(item)
  const palette = paletteFor(index < 0 ? 0 : index)
  emit('pick', {
    color: palette.color,
    art: palette.art,
    title: item.title,
    author: item.author,
    year: item.year,
    publisher: item.publisher,
    translator: item.translator,
    pages: item.pages,
    isbn: item.isbn,
    summary: item.summary,
    rating: item.rating,
    tags: item.tags,
    cover: item.cover
  })
  open.value = false
}

/** 「仅封面」：只换封面，不动用户已填内容。 */
function useCover(item: CatalogItem) {
  const index = books.value.indexOf(item)
  const palette = paletteFor(index < 0 ? 0 : index)
  emit('pick', { color: palette.color, art: palette.art, coverOnly: true, cover: item.cover })
  open.value = false
}

/** 配图：整张卡就是选择。 */
function useTheme(index: number) {
  const palette = paletteFor(index)
  const item = images.value[index]
  emit('pick', { color: palette.color, art: palette.art, name: item?.title, cover: item?.cover, coverOnly: isBook.value })
  open.value = false
}
</script>

<style scoped>
.fd-image { width: 100%; height: 100%; display: block; }

.fd-sources { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.fd-source {
  height: 30px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink-500);
  font-size: 11.5px;
  margin: 0;
  line-height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.fd-source.on { border-color: var(--wood-600); background: var(--wood-100); color: var(--wood-900); font-weight: 600; }
.fd-source-note { font-size: 9.5px; color: var(--ink-300); }
.fd-source.on .fd-source-note { color: var(--wood-700); }
.fd-placeholder { height: 64px; margin: 8px 0; border-radius: 10px; background: var(--wood-100); }
.fd-search { display: flex; gap: 8px; margin-bottom: 9px; }
.fd-search .input { flex: 1; min-width: 0; height: 40px; }
.fd-search .btn { flex: 0 0 auto; width: auto; min-height: 40px; padding: 0 16px; }

.fd-words { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; }
.fd-word {
  flex: 0 0 auto;
  height: 25px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px dashed var(--line-strong);
  background: var(--surface);
  color: var(--ink-500);
  font-size: 11px;
  line-height: 23px;
  margin: 0;
}

.fd-status { display: block; font-size: 10.5px; color: var(--ink-400); margin-bottom: 9px; }

.fd-list { display: flex; flex-direction: column; gap: 9px; }

.fd-row {
  display: flex;
  gap: 11px;
  align-items: stretch;
  padding: 9px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface);
}

.fd-thumb {
  position: relative;
  flex: 0 0 52px;
  width: 52px;
  aspect-ratio: 2 / 3;
  border-radius: 2px 4px 4px 2px;
  overflow: hidden;
  background: var(--wood-200);
  box-shadow: 0 2px 6px -2px rgba(74, 53, 32, 0.4);
}

.fd-info { min-width: 0; flex: 1; display: flex; flex-direction: column; justify-content: center; gap: 2px; }
.fd-t { font-size: 12.5px; font-weight: 650; color: var(--ink-800); line-height: 1.35; }
.fd-a { font-size: 11px; color: var(--ink-600); }
.fd-p { font-size: 10px; color: var(--ink-400); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.fd-acts { flex: 0 0 auto; display: flex; flex-direction: column; gap: 5px; justify-content: center; }
.fd-use {
  height: 27px;
  padding: 0 10px;
  border-radius: 999px;
  border: 0;
  background: var(--wood-700);
  color: #fff;
  font-size: 10.5px;
  font-weight: 600;
  white-space: nowrap;
  line-height: 27px;
  margin: 0;
}
.fd-cover {
  height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink-500);
  font-size: 9.5px;
  white-space: nowrap;
  line-height: 22px;
  margin: 0;
}

.fd-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px 9px; }

.fd-theme { border: 0; background: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 3px; text-align: left; }
.fd-theme-img {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 5px;
  overflow: hidden;
  box-shadow: var(--shadow-book);
  background: var(--wood-200);
}
.fd-theme-n { font-size: 10px; color: var(--ink-600); font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fd-theme-k { font-size: 9px; color: var(--ink-300); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
