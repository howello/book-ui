<template>
  <AppPage :loading="loading" title="新建" subtitle="分类或书本" back back-label="返回书架">
    <scroll-view class="scroll" scroll-y>
      <view class="seg">
        <button class="seg-btn" :class="{ on: pane === 'category' }" @click="pane = 'category'">新建分类</button>
        <button class="seg-btn" :class="{ on: pane === 'book' }" @click="pane = 'book'">新建书本</button>
      </view>

      <!-- 新建分类 -->
      <view v-if="pane === 'category'" class="pane">
        <view class="split">
          <view class="mini-cover">
            <AppImage v-if="folderPreview" class="chosen-cover" :src="folderPreview" mode="aspectFill" fill />
            <CoverFace v-else :title="folderTitle || '未命名分类'" :color="folderColor" :art="folderArt" />
          </view>
          <view class="split-fields">
            <view class="field" style="margin-top: 0">
              <text class="label">分类名称 *</text>
              <input v-model="folderTitle" class="input" placeholder="如：心理学" />
            </view>
            <view class="field">
              <text class="label">说明</text>
              <input v-model="folderDesc" class="input" placeholder="可选" />
            </view>
          </view>
        </view>

        <view class="field">
          <text class="label">分类配图</text>
          <view class="cover-actions">
            <button class="btn line sm" @click="shuffleFolderCover">
              <AppIcon name="image" :size="13" />随机一张
            </button>
            <button class="btn line sm" @click="openFinder('themes')">
              <AppIcon name="search" :size="13" />查找配图
            </button>
          </view>
          <text class="hint">默认图库随包发布，点「随机一张」可换；也可以按分类名在线查图</text>
        </view>

        <view class="field">
          <text class="label">父分类</text>
          <view class="input picker">书架根目录</view>
          <text class="hint">分类可以嵌套：例如「技术 / 系统设计」</text>
        </view>
      </view>

      <!-- 新建书本 -->
      <view v-else class="pane">
        <view class="split">
          <view class="mini-cover">
            <AppImage v-if="bookPreview" class="chosen-cover" :src="bookPreview" mode="aspectFill" fill />
            <CoverFace v-else :title="bookTitle || '未命名'" :author="bookAuthor" :color="bookColor" :art="bookArt" />
          </view>
          <view class="split-fields">
            <view class="field" style="margin-top: 0">
              <text class="label">书名 *</text>
              <input v-model="bookTitle" class="input" placeholder="书名" />
            </view>
            <view class="field">
              <text class="label">作者</text>
              <input v-model="bookAuthor" class="input" placeholder="作者" />
            </view>
          </view>
        </view>

        <view class="field">
          <text class="label">封面</text>
          <view class="cover-actions">
            <button class="btn line sm" @click="shuffleBookCover">
              <AppIcon name="image" :size="13" />随机一张
            </button>
            <button class="btn line sm" @click="openFinder('books')">
              <AppIcon name="search" :size="13" />查找书本
            </button>
          </view>
          <text class="hint">默认图库随包发布；按书名查可一次带入作者 / 出版社 / 年份等书目信息</text>
        </view>

        <view class="grid2">
          <view class="field" style="margin-top: 0">
            <text class="label">出版社</text>
            <input v-model="bookPublisher" class="input" placeholder="自动填充" />
          </view>
          <view class="field" style="margin-top: 0">
            <text class="label">出版年</text>
            <input v-model="bookYear" class="input" type="number" placeholder="自动填充" />
          </view>
        </view>

        <view class="grid2" style="margin-top: 13px">
          <view class="field" style="margin-top: 0">
            <text class="label">译者</text>
            <input v-model="bookTranslator" class="input" placeholder="外文译本填写" />
          </view>
          <view class="field" style="margin-top: 0">
            <text class="label">总页数</text>
            <input v-model="bookPages" class="input" type="number" placeholder="自动填充" />
          </view>
        </view>

        <view class="grid2" style="margin-top: 13px">
          <view class="field" style="margin-top: 0">
            <text class="label">ISBN</text>
            <input v-model="bookIsbn" class="input" placeholder="选填" />
          </view>
          <view class="field" style="margin-top: 0">
            <text class="label">评分</text>
            <input v-model="bookRating" class="input" type="digit" placeholder="0–10" />
          </view>
        </view>

        <view class="field">
          <text class="label">简介 / 标签</text>
          <textarea v-model="bookIntro" class="textarea" placeholder="简介可自动填充，也可手写" />
          <input v-model="bookTags" class="input tags-input" placeholder="标签用顿号分隔，如：小说、生命" />
        </view>

        <view class="field">
          <text class="label">归入分类</text>
          <picker :range="parentLabels" :value="parentIndex" @change="onParentChange">
            <view class="input picker">{{ parentLabels[parentIndex] }}</view>
          </picker>
        </view>

        <view class="field">
          <text class="label">快捷信息</text>
          <view class="quick">
            <button
              v-for="status in statuses"
              :key="status"
              class="quick-btn"
              :class="{ on: bookStatus === status }"
              @click="bookStatus = status"
            >
              {{ status }}
            </button>
          </view>
          <text class="hint">出版社、年份、总页数等可以之后在「编辑书」里补</text>
        </view>
      </view>
    </scroll-view>



    <CoverFinder
      v-model="finderOpen"
      :mode="finderMode"
      :query="finderMode === 'books' ? bookTitle : folderTitle"
      :author="bookAuthor"
      @pick="applyPick"
    />
    <AppToast />
    <template #footer v-if="!loading">
    <view class="fab-bar">
      <button class="btn line" @click="cancel">取消</button>
      <button class="btn" :disabled="saving" :aria-busy="saving" @click="submit">
          <text v-if="saving" class="btn-spinner" />
          <text>{{ saving ? '创建中…' : '创建' }}</text>
        </button>
    </view>
    </template>
</AppPage>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import AppToast from '../../components/AppToast.vue'
import AppIcon from '../../components/AppIcon.vue'
import AppImage from '../../components/AppImage.vue'
import CoverFace from '../../components/CoverFace.vue'
import CoverFinder from '../../components/CoverFinder.vue'
import { joinCoverRef, libraryCoverUrl, randomLibraryCover } from '../../shared/covers'
import { ROUTES, goBack, goHome } from '../../shared/navigation'
import { fetchNodes, useBookStore } from '../../shared/store'
import type { BookNode } from '../../shared/types'
import { stringifyContent } from '../../shared/types'
import { importCover, pageOption, requireLogin, saveNode } from '../../shared/use-book'
import { toast } from '../../shared/toast'

const store = useBookStore()
const pane = ref<'category' | 'book'>('category')
const tree = ref<BookNode[]>([])
const saving = ref(false)
const finderOpen = ref(false)
const finderMode = ref<'books' | 'themes'>('themes')

const folderTitle = ref('')
const folderDesc = ref('')
const folderColor = ref('plum')
const folderArt = ref('plain')
/** 在线检索到的封面地址（保存时转存） */
const folderCover = ref('')
/** 图库封面相对路径（随包发布，不需要上传） */
const folderLibrary = ref('')

const bookTitle = ref('')
const bookAuthor = ref('')
const bookPublisher = ref('')
const bookYear = ref('')
const bookColor = ref('ink')
const bookArt = ref('plain')
const bookStatus = ref('想读')
const bookTranslator = ref('')
const bookPages = ref('')
const bookIsbn = ref('')
const bookRating = ref('')
const bookIntro = ref('')
const bookTags = ref('')
const bookCover = ref('')
const bookLibrary = ref('')

const statuses = ['想读', '在读', '已读完', '搁置']

/** 预览地址：图库图优先，其次在线检索结果。 */
const folderPreview = computed(() => libraryCoverUrl(folderLibrary.value) || folderCover.value)
const bookPreview = computed(() => libraryCoverUrl(bookLibrary.value) || bookCover.value)

/** 随机换一张图库封面，分类与书本共用同一图库。 */
function shuffleFolderCover() {
  folderLibrary.value = randomLibraryCover(folderLibrary.value)
  folderCover.value = ''
}

function shuffleBookCover() {
  bookLibrary.value = randomLibraryCover(bookLibrary.value)
  bookCover.value = ''
}

/** 分类候选：根目录 + 所有分类（书本只能挂在分类下）。 */
const categories = computed(() => tree.value.filter(node => node.nodeType === 'category'))
const parentLabels = computed(() => categories.value.map(node => node.title))
const parentIndex = ref(0)
const parentId = ref<string | null>(null)

function onParentChange(event: { detail: { value: string | number } }) {
  parentIndex.value = Number(event.detail.value)
  parentId.value = categories.value[parentIndex.value]?.id || null
}

function openFinder(mode: 'books' | 'themes') {
  finderMode.value = mode
  finderOpen.value = true
}

function applyPick(pick: {
  color: string
  art: string
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
  cover?: string
  coverOnly?: boolean
}) {
  const isBook = finderMode.value === 'books'
  if (isBook) {
    bookColor.value = pick.color
    bookArt.value = pick.art
    if (pick.cover) { bookCover.value = pick.cover; bookLibrary.value = '' }
    if (pick.coverOnly) { toast('已套用封面'); return }
    // 只回填接口真正给出的字段，缺的保留原值
    if (pick.title) bookTitle.value = pick.title
    if (pick.author) bookAuthor.value = pick.author
    if (pick.year) bookYear.value = pick.year
    if (pick.publisher) bookPublisher.value = pick.publisher
    if (pick.translator) bookTranslator.value = pick.translator
    if (pick.pages) bookPages.value = pick.pages
    if (pick.isbn) bookIsbn.value = pick.isbn
    if (pick.rating && pick.rating !== '0.0') bookRating.value = pick.rating
    if (pick.summary) bookIntro.value = pick.summary
    if (pick.tags) bookTags.value = pick.tags
    toast('已填入书目信息')
  } else {
    folderColor.value = pick.color
    folderArt.value = pick.art
    folderCover.value = pick.cover || ''
    folderLibrary.value = ''
    toast('已套用配图')
  }
}

/** 分类表单：分类建在书架根目录。 */
async function submitCategory() {
  const title = folderTitle.value.trim()
  if (!title) { toast('请填写分类名称'); return }
  // 图库图随包发布，直接存相对路径；在线图先转存到 R2
  const onlineCover = folderCover.value ? await importCover(folderCover.value) : ''
  const kind = onlineCover ? 'public' : folderLibrary.value ? 'local' : 'theme'
  const ref = onlineCover || folderLibrary.value || joinCoverRef(folderColor.value, folderArt.value)
  const created = await saveNode({
    id: newId(),
    parentId: null,
    nodeType: 'category',
    title,
    sortOrder: categories.value.length + 1,
    coverKind: kind,
    coverRef: ref
  } as BookNode, stringifyContent({
    desc: folderDesc.value.trim(),
    color: folderColor.value,
    art: folderArt.value
  }))
  toast(`已新建分类「${title}」`)
  uni.redirectTo({ url: `${ROUTES.category}?id=${created.id}` })
}

/** 书本表单：必须落在某个分类下。 */
async function submitBook() {
  const title = bookTitle.value.trim()
  if (!title) { toast('请填写书名'); return }
  if (!parentId.value) { toast('请先选择一个分类'); return }
  const onlineCover = bookCover.value ? await importCover(bookCover.value) : ''
  const kind = onlineCover ? 'public' : bookLibrary.value ? 'local' : 'theme'
  const ref = onlineCover || bookLibrary.value || joinCoverRef(bookColor.value, bookArt.value)
  const created = await saveNode({
    id: newId(),
    parentId: parentId.value,
    nodeType: 'book',
    title,
    sortOrder: tree.value.filter(node => node.parentId === parentId.value).length + 1,
    coverKind: kind,
    coverRef: ref
  } as BookNode, stringifyContent({
    author: bookAuthor.value.trim(),
    publisher: bookPublisher.value.trim(),
    year: bookYear.value.trim(),
    translator: bookTranslator.value.trim(),
    pages: bookPages.value.trim(),
    isbn: bookIsbn.value.trim(),
    rating: bookRating.value.trim(),
    intro: bookIntro.value.trim(),
    tags: bookTags.value.split(/[、,，]/).map(tag => tag.trim()).filter(Boolean),
    status: bookStatus.value,
    progress: bookStatus.value === '已读完' ? 100 : bookStatus.value === '在读' ? 10 : 0,
    color: bookColor.value,
    art: bookArt.value
  }))
  toast(`已创建《${title}》`)
  uni.redirectTo({ url: `${ROUTES.book}?id=${created.id}` })
}

async function submit() {
  if (saving.value) return
  saving.value = true
  try {
    if (pane.value === 'category') await submitCategory()
    else await submitBook()
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '创建失败')
  } finally {
    saving.value = false
  }
}

function cancel() {
  goBack()
}

function newId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const digit = Math.floor(Math.random() * 16)
    return (char === 'x' ? digit : (digit & 3) | 8).toString(16)
  })
}

const loading = ref(true)

onLoad(async options => {
  if (!requireLogin()) return
  const kind = pageOption('kind', (options?.kind as string) || 'category')
  const parent = pageOption('parentId', (options?.parentId as string) || '')
  pane.value = kind === 'book' ? 'book' : 'category'
  // 新建时默认随机抽一张图库封面，分类与书本共用图库
  folderLibrary.value = randomLibraryCover()
  bookLibrary.value = randomLibraryCover(folderLibrary.value)
  try {
    tree.value = await fetchNodes({ tree: true })
    if (parent) {
      parentIndex.value = Math.max(0, categories.value.findIndex(node => node.id === parent))
      parentId.value = parent
    } else if (categories.value[0]) {
      parentId.value = categories.value[0].id
      parentIndex.value = 0
    }
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '加载失败')
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.chosen-cover { width: 100%; height: 100%; display: block; }
.scroll {
  flex: 1;
  min-height: 0;
  padding: 4px 16px 12px;
  box-sizing: border-box;
}

.seg {
  display: flex;
  gap: 3px;
  padding: 3px;
  background: var(--paper-2);
  border-radius: 10px;
  border: 1px solid var(--line);
  margin-bottom: 15px;
}
.seg-btn {
  flex: 1;
  height: 32px;
  border: 0;
  border-radius: 8px;
  background: none;
  font-size: 12.5px;
  color: var(--ink-500);
  font-weight: 500;
  margin: 0;
  line-height: 32px;
}
.seg-btn.on { background: var(--surface); color: var(--wood-900); font-weight: 600; box-shadow: var(--shadow-card); }

.split { display: flex; gap: 13px; margin-bottom: 14px; }
.split-fields { flex: 1; min-width: 0; }
.mini-cover {
  width: 74px;
  flex: 0 0 74px;
  aspect-ratio: 2 / 3;
  border-radius: 3px 5px 5px 3px;
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-book);
}

.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.grid2 .field + .field { margin-top: 0; }

.picker { display: flex; align-items: center; color: var(--ink-700); }

.find-btn { margin-top: 9px; }
.cover-actions { display: flex; gap: 7px; margin-top: 9px; flex-wrap: wrap; }
.cover-actions .btn { min-height: 32px; }
.chosen-cover { position: absolute; inset: 0; width: 100%; height: 100%; }

.quick { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 2px; }
.quick-btn {
  height: 26px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink-500);
  font-size: 11.5px;
  margin: 0;
  line-height: 24px;
}
.quick-btn.on { border-color: var(--wood-600); color: var(--wood-900); background: var(--wood-100); font-weight: 600; }
</style>
