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
          <picker :range="parentLabels" :value="parentIndex" @change="onParentChange">
            <view class="input picker">{{ parentLabels[parentIndex] }}</view>
          </picker>
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
            <text class="tiny">{{ bookCount }} 本书 · {{ noteCount }} 条感悟</text>
          </view>
          <button class="btn xs line" @click="viewCategory">查看</button>
        </view>
      </view>

      <view class="danger-zone">
        <button class="btn line danger" @click="deleteOpen = true">
          <AppIcon name="trash" :size="13" />删除分类
        </button>
        <text class="tiny danger-note">
          {{ bookCount ? `分类下还有 ${bookCount} 本书，需先移走或一并删除` : '删除后可在回收站恢复' }}
        </text>
      </view>
    </scroll-view>

    <AppSheet v-model="deleteOpen" :title="`删除「${form.name || '分类'}」？`" :subtitle="bookCount ? `分类下还有 ${bookCount} 本书，会一并进入回收站` : '删除后可在回收站恢复'">
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
import CoverFace from '../../components/CoverFace.vue'
import CoverFinder from '../../components/CoverFinder.vue'
import { baseApi } from '../../api-env'
import { contentCover, coverPalette, libraryCoverUrl, randomLibraryCover } from '../../shared/covers'
import { ROUTES, goBack } from '../../shared/navigation'
import { fetchNodes, removeNode, useBookStore } from '../../shared/store'
import type { BookNode } from '../../shared/types'
import { parseContent, stringifyContent } from '../../shared/types'
import { importCover, pageOption, requireLogin, saveNode } from '../../shared/use-book'
import { toast } from '../../shared/toast'

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
}

const category = computed(() => tree.value.find(node => node.id === categoryId.value))
const palette = computed(() => coverPalette(form.color))
const selectedCover = ref('')
const previewImage = computed(() =>
  libraryCoverUrl(form.libraryRef) ||
  selectedCover.value ||
  (form.coverKind === 'public' ? form.coverRef : ''))

const books = computed(() => tree.value.filter(node => node.parentId === categoryId.value && node.nodeType === 'book'))
const bookCount = computed(() => books.value.length)
const noteCount = computed(() => {
  let total = 0
  for (const book of books.value) total += tree.value.filter(node => node.parentId === book.id && node.nodeType === 'note').length
  return total
})

/** 可选父分类：排除自身与自身后代，避免成环。 */
const parentOptions = computed(() => {
  const blocked = new Set<string>([categoryId.value])
  let changed = true
  while (changed) {
    changed = false
    for (const node of tree.value) {
      if (node.parentId && blocked.has(node.parentId) && !blocked.has(node.id)) {
        blocked.add(node.id)
        changed = true
      }
    }
  }
  return tree.value.filter(node => node.nodeType === 'category' && !blocked.has(node.id))
})
const parentLabels = computed(() => ['书架根目录（第一层）', ...parentOptions.value.map(node => node.title)])
const parentIndex = computed(() => {
  const index = parentOptions.value.findIndex(node => node.id === form.parentId)
  return index < 0 ? 0 : index + 1
})

function onParentChange(event: { detail: { value: string | number } }) {
  const index = Number(event.detail.value)
  form.parentId = index === 0 ? null : parentOptions.value[index - 1]?.id || null
}

function applyTheme(pick: { color: string; art: string; name?: string; cover?: string }) {
  form.color = pick.color
  form.art = pick.art
  selectedCover.value = pick.cover || ''
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
        const url = await upload(path)
        selectedCover.value = ''
        form.coverKind = 'public'
        form.coverRef = url
        toast('封面已上传，保存后生效')
      } catch (failure) {
        toast(failure instanceof Error ? failure.message : '封面上传失败')
      } finally {
        uploading.value = false
      }
    }
  })
}

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
    const cover = selectedCover.value ? await importCover(selectedCover.value) : ''
    await saveNode({
      ...node,
      title: name,
      parentId: form.parentId,
      sortOrder: Number(form.sortOrder) || 0,
      coverKind: cover ? 'public' : form.coverKind || 'theme',
      coverRef: cover || form.coverRef || null
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
    toast('已移入回收站，30 天内可恢复')
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
    tree.value = await fetchNodes({ tree: true })
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
