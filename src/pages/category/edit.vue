<template>
  <AppPage :loading="loading" title="分类信息" :subtitle="category?.title || ''" back>
    <template #action>
      <button class="act act-text" :disabled="saving" :aria-busy="saving" @click="submit">
        <text v-if="saving" class="btn-spinner" />
        <text>{{ saving ? '保存中…' : '保存' }}</text>
      </button>
    </template>

    <scroll-view class="scroll" scroll-y>
      <!-- 配图 -->
      <view class="card">
        <view class="cat-preview-wrap">
          <view class="cat-preview">
            <CoverFace :title="form.name || '未命名分类'" :color="form.color" :art="form.art" :image="previewImage" />
            <view class="cat-shade">
              <text class="cat-name" :style="{ color: palette.ink }">{{ form.name || '未命名分类' }}</text>
              <text class="cat-desc" :style="{ color: palette.ink }">{{ form.desc || '0 本' }}</text>
            </view>
          </view>
          <view class="cat-tools">
            <view class="btns">
              <button class="btn line" @click="finderOpen = true">
                <AppIcon name="search" :size="13" />查找配图
              </button>
              <button class="btn ghost" @click="shuffleCover">
                <AppIcon name="image" :size="13" />随机一张
              </button>
              <button class="btn ghost" :disabled="uploading" :aria-busy="uploading" @click="pickCover">
                <text v-if="uploading" class="btn-spinner" />
                <AppIcon v-else name="upload" :size="13" />{{ uploading ? '上传中…' : '上传' }}
              </button>
            </view>
            <text class="hint">按「分类名 + 意境 / 封面 / 静物」等关键词查图，选中后自动套用</text>
          </view>
        </view>
      </view>

      <!-- 基本信息 -->
      <view class="card">
        <view class="field" style="margin-top: 0">
          <text class="label">分类名称 *</text>
          <input v-model="form.name" class="input" />
        </view>
        <view class="field">
          <text class="label">一句话说明</text>
          <input v-model="form.desc" class="input" />
        </view>
        <view class="field">
          <text class="label">父分类</text>
          <CategoryPicker v-model="form.parentId" allow-root :excluded="categoryId" label="父分类" />
          <text class="hint">移动分类时会校验不能移到自己或自己的子分类下</text>
        </view>
        <view class="field">
          <text class="label">排序</text>
          <input v-model="form.sortOrder" class="input" type="number" />
          <text class="hint">数字小的排前面</text>
        </view>
      </view>

      <!-- 统计 -->
      <view class="card">
        <view class="between">
          <view>
            <text class="row-title">分类内容</text>
            <text class="tiny">{{ totals.categories }} 个子分类 · {{ totals.books }} 本书 · {{ totals.notes }} 条感悟</text>
          </view>
          <button class="btn xs line" @click="viewCategory">查看</button>
        </view>
      </view>

      <view class="danger-zone">
        <button class="btn line danger" @click="deleteOpen = true">
          <AppIcon name="trash" :size="13" />删除分类
        </button>
        <text class="tiny danger-note">
          {{ deleteSummary }}
        </text>
      </view>
    </scroll-view>

    <AppSheet v-model="deleteOpen" :title="`删除「${form.name || '分类'}」？`" :subtitle="deleteSummary">
      <view class="sheet-acts">
        <button class="btn line" @click="deleteOpen = false">取消</button>
        <button class="btn backdrop" @click="confirmRemove">确认删除</button>
      </view>
    </AppSheet>

    <CoverFinder v-model="finderOpen" mode="themes" :query="form.name || '分类'" @pick="applyTheme" />
    <AppToast />
</AppPage>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import AppToast from '../../components/AppToast.vue'
import AppIcon from '../../components/AppIcon.vue'
import AppSheet from '../../components/AppSheet.vue'
import CategoryPicker from '../../components/CategoryPicker.vue'
import CoverFace from '../../components/CoverFace.vue'
import CoverFinder from '../../components/CoverFinder.vue'
import { contentCover, coverPalette, libraryCoverUrl, randomLibraryCover } from '../../shared/covers'
import { ROUTES, goBack } from '../../shared/navigation'
import { fetchNodePage, removeNode, useBookStore } from '../../shared/store'
import type { BookNode } from '../../shared/types'
import { parseContent, stringifyContent } from '../../shared/types'
import { pageOption, requireLogin, saveNode } from '../../shared/use-book'
import { toast } from '../../shared/toast'
import { keepNoteMedia } from '../../shared/media'

const store = useBookStore()
const categoryId = ref('')
const tree = ref<BookNode[]>([])
const saving = ref(false)
/** 封面上传中：按钮转圈并禁用，避免重复点 */
const uploading = ref(false)
const finderOpen = ref(false)
const deleteOpen = ref(false)

const form = reactive({
  name: '',
  desc: '',
  color: 'clay',
  art: 'plain',
  sortOrder: '0',
  parentId: '' as string | null,
  coverKind: '',
  coverRef: '',
  /** 图库封面相对路径（保存时不转存） */
  libraryRef: ''
})

/** 随机换一张图库封面（与书本共用图库）。 */
function shuffleCover() {
  form.libraryRef = randomLibraryCover(form.libraryRef)
  localCoverKey.value = ''
  selectedCover.value = ''
}

const category = computed(() => tree.value.find(node => node.id === categoryId.value))
const palette = computed(() => coverPalette(form.color))
const selectedCover = ref('')
const localCoverKey = ref('')
const previewImage = computed(() =>
  (localCoverKey.value ? 'book-local-media:' + localCoverKey.value : '') ||
  selectedCover.value || libraryCoverUrl(form.libraryRef) ||
  (['public', 'external'].includes(form.coverKind) ? form.coverRef : ''))

const totals = computed(() => {
  const rows = tree.value.filter(node => node.parentId === categoryId.value)
  const books = rows.filter(node => node.nodeType === 'book')
  return { books: books.length, categories: rows.length - books.length, notes: books.reduce((count, book) => count + (book.childCount || 0), 0) }
})
const deleteSummary = computed(() => {
  const { books, categories } = totals.value
  return books || categories ? `${categories} 个子分类及 ${books} 本书会一并删除` : '删除后无法恢复'
})

function applyTheme(pick: { color: string; art: string; name?: string; cover?: string }) {
  form.color = pick.color
  form.art = pick.art
  selectedCover.value = pick.cover || ''
  if (pick.cover) { localCoverKey.value = ''; form.libraryRef = '' }
  toast('已套用配图 · ' + (pick.name || pick.color))
}

/** 上传分类封面。 */
function pickCover() {
  uni.chooseImage({
    count: 1,
    sourceType: ['album', 'camera'],
    success: async result => {
      const path = Array.isArray(result.tempFilePaths) ? result.tempFilePaths[0] : result.tempFilePaths
      if (!path) return
      uploading.value = true
      try {
        localCoverKey.value = await keepNoteMedia(store.account.value, path)
        selectedCover.value = ''
        form.libraryRef = ''
        toast('已保存图片，联网后同步')
      } catch (failure) {
        toast(failure instanceof Error ? failure.message : '封面上传失败')
      } finally {
        uploading.value = false
      }
    }
  })
}

function viewCategory() {
  uni.redirectTo({ url: `${ROUTES.category}?id=${categoryId.value}` })
}

async function submit() {
  const node = category.value
  if (!node || saving.value) return
  const name = form.name.trim()
  if (!name) { toast('请填写分类名称'); return }
  saving.value = true
  try {
    const next = {
      ...parseContent(node),
      desc: form.desc.trim(),
      color: form.color,
      art: form.art
    }
    const pendingCover = localCoverKey.value ? { localKey: localCoverKey.value }
      : selectedCover.value ? { remoteUrl: selectedCover.value } : undefined
    await saveNode({
      ...node,
      title: name,
      parentId: form.parentId,
      sortOrder: Number(form.sortOrder) || 0,
      coverKind: form.libraryRef ? 'local' : form.coverKind || 'theme',
      coverRef: form.libraryRef || form.coverRef || null,
      pendingCover
    }, stringifyContent(next))
    toast('已保存分类信息')
    goBack()
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '保存失败')
  } finally {
    saving.value = false
  }
}

async function confirmRemove() {
  deleteOpen.value = false
  try {
    await removeNode(categoryId.value)
    toast('已删除')
    uni.reLaunch({ url: ROUTES.home })
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
    tree.value = await fetchNodePage(categoryId.value)
    const node = category.value
    if (!node) { toast('分类不存在或已删除'); return }
    const content = parseContent(node)
    form.name = node.title
    form.desc = content.desc || ''
    const cover = contentCover(content)
    form.color = cover.color
    form.art = cover.art
    form.sortOrder = String(node.sortOrder ?? 0)
    form.parentId = node.parentId || null
    form.coverKind = node.coverKind || ''
    form.coverRef = node.coverRef || ''
    selectedCover.value = node.pendingCover?.remoteUrl || ''
    localCoverKey.value = node.pendingCover?.localKey || ''
    form.libraryRef = node.coverKind === 'local' ? node.coverRef || '' : ''
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '加载失败')
  } finally {
    loading.value = false
  }
}

onLoad(options => {
  categoryId.value = pageOption('id', (options?.id as string) || '')
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

.cat-preview-wrap { display: flex; gap: 14px; align-items: flex-start; }
.cat-preview {
  width: 96px;
  flex: 0 0 96px;
  aspect-ratio: 2 / 3;
  border-radius: 5px 7px 7px 5px;
  position: relative;
  overflow: hidden;
  box-shadow: var(--shadow-book);
}
.cat-shade {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  padding: 12px 9px 11px 16px;
  background: linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.34));
}
.cat-name { display: block; font-family: var(--serif); font-size: 15px; font-weight: 600; line-height: 1.3; }
.cat-desc { display: block; font-size: 9.5px; opacity: 0.85; margin-top: 2px; }

.cat-tools { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 9px; }
.cat-tools .btns { display: flex; gap: 7px; flex-wrap: wrap; }
.cat-tools .btn { min-height: 33px; font-size: 12px; padding: 0 13px; }
.label-inline { font-weight: 400; }

.picker { display: flex; align-items: center; color: var(--ink-700); }
.row-title { display: block; font-size: 13px; font-weight: 650; margin-bottom: 2px; }

.danger-zone { margin-top: 16px; }
.danger { color: var(--red-700); width: 100%; }
.danger-note { display: block; text-align: center; margin-top: 8px; }
</style>
