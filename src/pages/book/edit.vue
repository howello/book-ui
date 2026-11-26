<template>
  <AppPage :loading="loading" title="书本信息" :subtitle="book ? `《${book.title}》` : ''" back>
    <template #action>
      <button class="act act-text" :disabled="saving" :aria-busy="saving" @click="submit">
        <text v-if="saving" class="btn-spinner" />
        <text>{{ saving ? '保存中…' : '保存' }}</text>
      </button>
    </template>

    <scroll-view class="scroll" scroll-y>
      <!-- 封面 -->
      <view class="card">
        <view class="cover-section">
          <view class="cover-big">
            <CoverFace :title="form.title || '未命名'" :author="form.author" :color="form.color" :art="form.art" :image="previewImage" />
          </view>
          <view class="cover-tools">
            <button class="btn line" @click="openFinder">
              <AppIcon name="search" :size="13" />查找书本
            </button>
            <view class="cover-actions">
              <button class="btn ghost" @click="shuffleCover">
                <AppIcon name="image" :size="13" />随机一张
              </button>
              <button class="btn ghost" :disabled="uploading" :aria-busy="uploading" @click="pickCover">
                <text v-if="uploading" class="btn-spinner" />
                <AppIcon v-else name="upload" :size="13" />{{ uploading ? '上传中…' : '上传图片' }}
              </button>
            </view>
            <text class="hint">按书名查封面 + 作者 / 出版社 / 年份，选中一次填完</text>
          </view>
        </view>
      </view>

      <!-- 基本信息 -->
      <view class="card">
        <view class="field" style="margin-top: 0">
          <text class="label">书名 *</text>
          <input v-model="form.title" class="input" placeholder="输入书名后可一键查找" />
        </view>
        <view class="field">
          <text class="label">作者</text>
          <input v-model="form.author" class="input" />
        </view>
        <view class="grid2">
          <view class="field" style="margin-top: 0">
            <text class="label">出版社</text>
            <input v-model="form.publisher" class="input" />
          </view>
          <view class="field" style="margin-top: 0">
            <text class="label">出版年</text>
            <input v-model="form.year" class="input" type="number" />
          </view>
        </view>
        <view class="grid2" style="margin-top: 13px">
          <view class="field" style="margin-top: 0">
            <text class="label">总页数</text>
            <input v-model="form.pages" class="input" type="number" />
          </view>
          <view class="field" style="margin-top: 0">
            <text class="label">阅读状态</text>
            <picker :range="statuses" :value="statusIndex" @change="onStatusChange">
              <view class="input picker">{{ form.status }}</view>
            </picker>
          </view>
        </view>
        <view class="grid2" style="margin-top: 13px">
          <view class="field" style="margin-top: 0">
            <text class="label">译者</text>
            <input v-model="form.translator" class="input" placeholder="外文译本填写" />
          </view>
          <view class="field" style="margin-top: 0">
            <text class="label">ISBN</text>
            <input v-model="form.isbn" class="input" placeholder="选填" />
          </view>
        </view>
        <view class="field">
          <text class="label">评分 <text class="tiny label-inline">选填，0–10</text></text>
          <view class="rating-row">
            <input v-model="form.rating" class="input" type="digit" placeholder="如 9.2" />
            <text class="tiny rating-hint">{{ ratingHint }}</text>
          </view>
        </view>
      </view>

      <!-- 简介 -->
      <view class="card">
        <view class="field" style="margin-top: 0">
          <text class="label">简介 / 摘句</text>
          <textarea v-model="form.intro" class="textarea" placeholder="显示在感悟列表顶部，也可留空" />
          <text class="hint">显示在感悟列表顶部的书籍卡片里，也可留空</text>
        </view>
      </view>

      <!-- 标签 -->
      <view class="card">
        <view class="field" style="margin-top: 0">
          <text class="label">标签</text>
          <view class="tagbox">
            <view v-for="(tag, index) in form.tags" :key="tag" class="tag">
              <text>{{ tag }}</text>
              <button class="tag-remove" :aria-label="'移除标签 ' + tag" @click="removeTag(index)">
                <AppIcon name="close" :size="10" />
              </button>
            </view>
            <button class="tag-add" @click="addTag">
              <AppIcon name="plus" :size="10" />添加
            </button>
          </view>
        </view>
      </view>

      <!-- 所属分类 -->
      <view class="card">
        <view class="between">
          <view>
            <text class="row-title">所属分类</text>
            <text class="tiny">{{ categoryName || '未归入分类' }}</text>
          </view>
          <button class="btn xs line" @click="chooseCategory">切换</button>
        </view>
      </view>

      <!-- 删除 -->
      <view class="danger-zone">
        <button class="btn line danger" @click="remove">
          <AppIcon name="trash" :size="13" />删除这本书
        </button>
        <text class="tiny danger-note">删除会连同其下感悟与备注一起进入回收站，30 天内可恢复</text>
      </view>
    </scroll-view>

    <AppSheet v-model="deleteOpen" :title="`删除《${form.title || '这本书'}》？`" :subtitle="`${noteTotal} 条感悟与 ${remarkTotal} 条备注会一并进入回收站`">
      <view class="sheet-acts">
        <button class="btn line" @click="deleteOpen = false">取消</button>
        <button class="btn backdrop" @click="confirmRemove">确认删除</button>
      </view>
    </AppSheet>

    <CoverFinder
      v-model="finderOpen"
      mode="books"
      :query="form.title"
      :author="form.author"
      @pick="applyPick"
    />
    <AppToast />
</AppPage>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import AppToast from '../../components/AppToast.vue'
import { baseApi } from '../../api-env'
import AppIcon from '../../components/AppIcon.vue'
import AppSheet from '../../components/AppSheet.vue'
import CoverFace from '../../components/CoverFace.vue'
import CoverFinder from '../../components/CoverFinder.vue'
import { contentCover, libraryCoverUrl, randomLibraryCover } from '../../shared/covers'
import { ROUTES, goBack } from '../../shared/navigation'
import { fetchNodes, removeNode, useBookStore } from '../../shared/store'
import type { BookNode } from '../../shared/types'
import { parseContent, stringifyContent } from '../../shared/types'
import { importCover, pageOption, requireLogin, saveNode } from '../../shared/use-book'
import { toast } from '../../shared/toast'

const store = useBookStore()
const bookId = ref('')
const tree = ref<BookNode[]>([])
const saving = ref(false)
/** 封面上传中：按钮转圈并禁用，避免重复点 */
const uploading = ref(false)
const finderOpen = ref(false)
const deleteOpen = ref(false)

const statuses = ['已读完', '在读', '想读', '搁置']

const form = reactive({
  title: '',
  author: '',
  translator: '',
  publisher: '',
  year: '',
  pages: '',
  isbn: '',
  rating: '',
  status: '想读',
  intro: '',
  tags: [] as string[],
  color: 'clay',
  art: 'plain',
  parentId: '' as string | null,
  coverKind: '' as string,
  coverRef: '' as string,
  /** 图库封面相对路径（保存时不转存） */
  libraryRef: '' as string,
  /** 检索到的在线封面，保存时转存 */
  externalCover: ''
})

const book = computed(() => tree.value.find(node => node.id === bookId.value))
const categoryName = computed(() => tree.value.find(node => node.id === form.parentId)?.title || '')
const statusIndex = computed(() => Math.max(0, statuses.indexOf(form.status)))
const ratingHint = computed(() => {
  const value = Number(form.rating)
  if (!Number.isFinite(value) || !form.rating) return '—'
  return value >= 8.5 ? '好评' : value >= 7 ? '不错' : '一般'
})

/** 封面预览：已上传图片优先，否则用配色绘制。 */
const previewImage = computed(() =>
  libraryCoverUrl(form.libraryRef) ||
  form.externalCover ||
  (form.coverKind === 'public' ? form.coverRef : ''))

/** 随机换一张图库封面（与分类共用图库）。 */
function shuffleCover() {
  form.libraryRef = randomLibraryCover(form.libraryRef)
  form.externalCover = ''
}

const noteTotal = computed(() => tree.value.filter(node => node.parentId === bookId.value && node.nodeType === 'note').length)
const remarkTotal = computed(() => {
  let total = 0
  const walk = (id: string) => {
    for (const node of tree.value.filter(item => item.parentId === id)) {
      if (node.nodeType === 'remark') total += 1
      walk(node.id)
    }
  }
  walk(bookId.value)
  return total
})

function onStatusChange(event: { detail: { value: string | number } }) {
  form.status = statuses[Number(event.detail.value)] || form.status
}

function removeTag(index: number) {
  form.tags.splice(index, 1)
}

function addTag() {
  uni.showModal({
    title: '添加标签',
    editable: true,
    placeholderText: '如：小说、心理学',
    success: result => {
      const value = result.content?.trim()
      if (result.confirm && value && !form.tags.includes(value)) form.tags.push(value)
    }
  })
}

function chooseCategory() {
  const targets = tree.value.filter(node => node.nodeType === 'category')
  if (!targets.length) { toast('没有可选的分类'); return }
  uni.showActionSheet({
    itemList: targets.map(node => node.title),
    success: result => {
      const target = targets[result.tapIndex]
      if (target) form.parentId = target.id
    }
  })
}

function openFinder() {
  finderOpen.value = true
}

/** 查找面板选中：完整回填或只换封面。 */
function applyPick(pick: { color: string; art: string; title?: string; author?: string; year?: string; publisher?: string; cover?: string; coverOnly?: boolean }) {
  form.color = pick.color
  form.art = pick.art
  if (pick.cover) form.externalCover = pick.cover
  if (pick.coverOnly) { toast('已套用封面，其余信息保持不变'); return }
  if (pick.title) form.title = pick.title
  if (pick.author) form.author = pick.author
  if (pick.year) form.year = pick.year
  if (pick.publisher) form.publisher = pick.publisher
  toast('已填入书目信息')
}

/** 上传封面：选图后直接上传，拿到 R2 地址写入 coverRef。 */
function pickCover() {
  uni.chooseImage({
    count: 1,
    sourceType: ['album', 'camera'],
    success: async result => {
      const path = Array.isArray(result.tempFilePaths) ? result.tempFilePaths[0] : result.tempFilePaths
      if (!path) return
      uploading.value = true
      try {
        const url = await upload(path)
        form.coverKind = 'public'
        form.coverRef = url
        form.externalCover = ''
        toast('封面已上传，保存后生效')
      } catch (failure) {
        toast(failure instanceof Error ? failure.message : '封面上传失败')
      } finally {
        uploading.value = false
      }
    }
  })
}

/** 上传单个文件到共享媒体接口，返回可访问地址。 */
function upload(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    uni.uploadFile({
      url: baseApi() + '/common/upload',
      filePath: path,
      name: 'file',
      header: { Authorization: 'Bearer ' + store.token.value },
      success: response => {
        try {
          const body = JSON.parse(response.data) as { code?: number; url?: string; msg?: string }
          if (response.statusCode === 200 && body.code === 200 && body.url) resolve(body.url)
          else reject(new Error(body.msg || '上传失败'))
        } catch {
          reject(new Error('上传失败'))
        }
      },
      fail: () => reject(new Error('上传失败'))
    })
  })
}

async function submit() {
  const node = book.value
  if (!node || saving.value) return
  if (!form.title.trim()) { toast('请填写书名'); return }
  saving.value = true
  try {
    // 采用在线封面时先转存到共享媒体存储，避免外链失效或防盗链
    let coverKind = form.coverKind || 'theme'
    let coverRef = form.coverRef || null
    if (form.libraryRef) {
      coverKind = 'local'
      coverRef = form.libraryRef
    }
    if (form.externalCover) {
      try {
        coverRef = await importCover(form.externalCover)
        coverKind = 'public'
        form.coverKind = coverKind
        form.coverRef = coverRef
        form.externalCover = ''
      } catch (failure) {
        toast(failure instanceof Error ? failure.message : '封面转存失败，已改用配色封面')
        coverKind = 'theme'
        coverRef = null
      }
    }
    const source = parseContent(node)
    const content = stringifyContent({
      ...source,
      author: form.author.trim(),
      translator: form.translator.trim(),
      publisher: form.publisher.trim(),
      year: form.year.trim(),
      pages: form.pages.trim(),
      isbn: form.isbn.trim(),
      rating: form.rating.trim(),
      status: form.status,
      progress: form.status === '已读完' ? 100 : source.progress,
      intro: form.intro.trim(),
      tags: form.tags,
      color: form.color,
      art: form.art
    })
    await saveNode({
      ...node,
      title: form.title.trim(),
      parentId: form.parentId,
      coverKind,
      coverRef
    }, content)
    toast('已保存书本信息')
    goBack()
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '保存失败')
  } finally {
    saving.value = false
  }
}

function remove() {
  deleteOpen.value = true
}

async function confirmRemove() {
  deleteOpen.value = false
  if (!bookId.value) return
  try {
    await removeNode(bookId.value)
    toast('已移入回收站，30 天内可恢复')
    if (form.parentId) uni.redirectTo({ url: `${ROUTES.category}?id=${form.parentId}` })
    else uni.reLaunch({ url: ROUTES.home })
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '删除失败')
  }
}

let hasLoaded = false
const loading = ref(true)

async function load() {
  if (!store.token.value) return
  if (loading.value && hasLoaded) return
  loading.value = true
  hasLoaded = true
  try {
    tree.value = await fetchNodes({ tree: true })
    const node = book.value
    if (!node) { toast('书本不存在或已删除'); return }
    const content = parseContent(node)
    form.title = node.title
    form.author = content.author || ''
    form.translator = content.translator || ''
    form.publisher = content.publisher || ''
    form.year = content.year || ''
    form.pages = content.pages || ''
    form.isbn = content.isbn || ''
    form.rating = content.rating || ''
    form.status = content.status || '想读'
    form.intro = content.intro || content.text || ''
    form.tags = Array.isArray(content.tags) ? [...content.tags] : []
    const cover = contentCover(content)
    form.color = cover.color
    form.art = cover.art
    form.parentId = node.parentId || null
    form.coverKind = node.coverKind || ''
    form.coverRef = node.coverRef || ''
    form.externalCover = ''
    form.libraryRef = node.coverKind === 'local' ? node.coverRef || '' : ''
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '加载失败')
  } finally {
    loading.value = false
  }
}

onLoad(options => {
  bookId.value = pageOption('id', (options?.id as string) || '')
  if (requireLogin()) void load()
})
</script>

<style scoped>
.scroll {
  flex: 1;
  min-height: 0;
  padding: 6px 16px 16px;
  box-sizing: border-box;
}

.cover-section { display: flex; gap: 14px; }
.cover-big {
  width: 96px;
  flex: 0 0 96px;
  aspect-ratio: 2 / 3;
  border-radius: 3px 6px 6px 3px;
  overflow: hidden;
  position: relative;
  box-shadow: var(--shadow-book);
  background: var(--wood-200);
}
.cover-tools { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 9px; }
.cover-tools .btn { min-height: 33px; font-size: 12px; padding: 0 13px; }

.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.grid2 .field + .field { margin-top: 0; }

.picker { display: flex; align-items: center; color: var(--ink-700); }
.label-inline { font-weight: 400; }

.rating-row { display: flex; align-items: center; gap: 12px; }
.rating-row .input { flex: 1; }
.rating-hint { flex: 0 0 auto; }

.tagbox { display: flex; flex-wrap: wrap; gap: 6px; }
.tag {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  background: var(--wood-100);
  color: var(--wood-900);
  font-size: 11.5px;
}
.tag-remove { border: 0; background: none; padding: 0; margin: 0; color: var(--wood-700); display: flex; width: 12px; height: 12px; }
.tag-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px dashed var(--line-strong);
  background: var(--surface);
  color: var(--ink-500);
  font-size: 11.5px;
  margin: 0;
  line-height: 24px;
}

.row-title { display: block; font-size: 13px; font-weight: 650; margin-bottom: 2px; }

.danger-zone { margin-top: 16px; }
.danger { color: var(--red-700); width: 100%; }
.danger-note { display: block; text-align: center; margin-top: 8px; }
</style>
