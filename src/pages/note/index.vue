<template>
  <AppPage :loading="loading" skeleton="detail" title="感悟" :subtitle="book ? `《${book.title}》` : ''" back>
    <template #action>
      <button class="act" aria-label="更多" @click="moreOpen = true">
        <AppIcon name="more" :size="20" />
      </button>
    </template>
    <template #path>
      <text class="link" @click="goHome">书架</text>
      <text class="sep">/</text>
      <text class="link" @click="openCategory">{{ category?.title || '分类' }}</text>
      <text class="sep">/</text>
      <text class="link" @click="openBook">{{ book?.title || '书本' }}</text>
      <text class="sep">/</text>
      <text class="cur">感悟</text>
    </template>

    <scroll-view class="scroll" scroll-y>
      <view v-if="error" class="error-tip">{{ error }}</view>

      <view v-if="note" class="note-head">
        <view class="meta">
          <text class="date">{{ createdText }}</text>
          <text>·</text>
          <text>第 {{ index }} 条</text>
          <view class="grow" />
          <text v-if="content.attachments?.length">{{ content.attachments.length }} 个附件</text>
        </view>
        <text class="note-title">{{ note.title }}</text>
        <view v-if="content.chapter" class="chapter-chip">
          <AppIcon name="book" :size="12" />
          <text>{{ content.chapter }}</text>
        </view>
      </view>

      <!-- 块级正文：独立卡片，与下方备注区视觉分离 -->
      <view v-if="note" class="block-wrap">
        <view class="block-card">
        <view class="blocks">
          <view v-for="block in blocks" :key="block.id" class="block">
            <text v-if="block.type === 'text'" class="block-text">{{ block.text }}</text>
            <view v-else-if="block.type === 'quote'" class="quote-block">
              <text>{{ block.text }}</text>
              <text v-if="block.page" class="page-ref">第 {{ block.page }} 页</text>
            </view>
            <view v-else-if="block.type === 'image'" class="block-img-wrap">
              <view class="block-img">
                <AppImage v-if="blockSrc(block)" class="photo" :src="blockSrc(block)" mode="widthFix" ratio="4 / 3" />
                <!-- 无地址 / 加载中：骨架占位（4:3 + 微光动画） -->
                <view v-else class="photo-ph img-placeholder">
                  <view class="img-skeleton" />
                  <text class="cap">图片未上传</text>
                </view>
              </view>
              <!-- 图片说明：小字号衬线斜体 + 左侧短线，像图注 -->
              <view v-if="block.caption" class="img-caption">
                <text class="img-caption-text">{{ block.caption }}</text>
              </view>
            </view>
            <view v-else-if="block.type === 'audio'" class="audio-block">
              <button class="audio-play" aria-label="播放语音" @click="play(block)">
                <AppIcon name="play" :size="14" />
              </button>
              <view class="audio-wave">
                <view
                  v-for="(height, i) in waveHeights(block.id)"
                  :key="i"
                  class="bar"
                  :style="{ height: height + 'px', opacity: playingId === block.id ? 1 : 0.55 }"
                />
              </view>
              <text class="audio-dur">{{ formatDuration(block.duration) }}</text>
            </view>

          </view>
        </view>
        </view>
      </view>

      <!-- 备注区：用色带标题 + 列表卡片，和正文明确分区 -->
      <view class="remark-section">
      <view class="remark-head">
        <view class="between">
          <text class="remark-title">备注 <text class="muted">{{ remarks.length }}</text></text>
          <SortMenu :options="remarkSortLabels" :index="remarkSortIndex" @change="setRemarkSort" />
        </view>
        <text class="tiny">备注可以继续嵌套，每一层都能再写备注</text>
      </view>

      <view class="remark-list">
        <view v-for="remark in remarks" :key="remark.id" class="remark-item">
          <view class="remark-hd">
            <view class="avatar">我</view>
            <text class="name">我</text>
            <text>·</text>
            <text>{{ timeOf(remark) }}</text>
          </view>
          <text class="remark-body">{{ bodyOf(remark) }}</text>
          <view class="remark-foot">
            <view class="foot-btn" @click="reply(remark)"><AppIcon name="corner" :size="12" /><text>回复</text></view>
            <view class="foot-btn" @click="editRemark(remark)"><AppIcon name="edit" :size="12" /><text>编辑</text></view>
          </view>
          <view v-if="childrenOf(remark).length" class="remark-tail" @click="openRemark(remark)">
            <AppIcon name="corner" :size="12" />
            <text>展开 {{ childrenOf(remark).length }} 条子备注</text>
          </view>
        </view>
        <view v-if="!remarks.length" class="empty">
          <AppIcon name="corner" :size="30" />
          <text class="empty-text">还没有备注，在下方写一条</text>
        </view>
      </view>
      </view>
      <view class="scroll-filler" />
    </scroll-view>



    <!-- 感悟更多菜单 -->
    <AppSheet v-model="moreOpen" title="这条感悟" :subtitle="createdText + (content.chapter ? ' · ' + content.chapter : '')">
      <button class="btn line sheet-btn" @click="editNote">
        <AppIcon name="edit" :size="13" />编辑感悟
      </button>
      <button class="btn line sheet-btn" @click="copyNote">
        <AppIcon name="note" :size="13" />复制全文
      </button>
      <button class="btn line sheet-btn" @click="exportNote">
        <AppIcon name="upload" :size="13" />导出这条
      </button>
      <button class="btn line sheet-btn danger" @click="removeNote">
        <AppIcon name="trash" :size="13" />删除感悟
      </button>
    </AppSheet>
    <AppToast />
    <template #footer v-if="!loading">
    <view class="composer">
      <input v-model="draftRemark" class="input" placeholder="写一条备注…" confirm-type="send" @confirm="submitRemark" />
      <button class="send" aria-label="发送" :disabled="posting" @click="submitRemark">
        <AppIcon name="send" :size="16" />
      </button>
    </view>
    </template>
</AppPage>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import AppToast from '../../components/AppToast.vue'
import AppIcon from '../../components/AppIcon.vue'
import AppImage from '../../components/AppImage.vue'
import SortMenu from '../../components/SortMenu.vue'
import AppSheet from '../../components/AppSheet.vue'
import { ROUTES, goHome } from '../../shared/navigation'
import { ApiError, fetchNode, fetchNodes, removeNode, useBookStore } from '../../shared/store'
import type { BookNode, NoteBlock } from '../../shared/types'
import { blocksOf, parseContent } from '../../shared/types'
import { pageOption, requireLogin, saveNode } from '../../shared/use-book'
import { formatDuration, useNoteMedia } from '../../shared/media'
import { noteMarkdown, saveMarkdown } from '../../shared/export-markdown'
import { toast } from '../../shared/toast'

const store = useBookStore()
const noteId = ref('')
const tree = ref<BookNode[]>([])
const detail = ref<BookNode>()
const error = ref('')
/** 备注排序：最新在前 / 最早在前 / 按层级（层级内再按时间）。 */
const remarkSortLabels = ['最新在前', '最早在前', '按层级']
const remarkSortIndex = ref(0)

/** 备注排序：0 最新 / 1 最早 / 2 按层级。 */
function setRemarkSort(index: number) {
  remarkSortIndex.value = index
}
const moreOpen = ref(false)
const draftRemark = ref('')
const posting = ref(false)
const playingId = ref('')
let player: UniApp.InnerAudioContext | undefined

const note = computed(() => detail.value)
const content = computed(() => parseContent(note.value))
const blocks = computed(() => blocksOf(note.value))
const book = computed(() => tree.value.find(node => node.id === note.value?.parentId))
const category = computed(() => tree.value.find(node => node.id === book.value?.parentId))

const remarks = computed(() => tree.value
  .filter(node => node.parentId === noteId.value && node.nodeType === 'remark')
  .sort((a, b) => {
    const byTime = (a.createdAt || '').localeCompare(b.createdAt || '')
    const byOrder = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    if (remarkSortIndex.value === 1) return byTime || byOrder
    if (remarkSortIndex.value === 2) return byOrder || byTime
    return -byTime || byOrder
  }))

/** 感悟在书本内的序号（按创建时间正序）。 */
const index = computed(() => {
  if (!book.value) return 1
  const siblings = tree.value
    .filter(node => node.parentId === book.value?.id && node.nodeType === 'note')
    .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''))
  const position = siblings.findIndex(node => node.id === noteId.value)
  return position < 0 ? siblings.length : position + 1
})

const createdText = computed(() => {
  const time = note.value?.createdAt || note.value?.updatedAt || ''
  return time ? time.slice(0, 16).replace('T', ' ') : ''
})

function bodyOf(node: BookNode) {
  return parseContent(node).text || node.title
}

function timeOf(node: BookNode) {
  const time = node.createdAt || node.updatedAt || ''
  return time ? time.slice(5, 16).replace('T', ' ') : ''
}

function childrenOf(node: BookNode) {
  return tree.value.filter(item => item.parentId === node.id)
}

/** 波形高度按块 ID 稳定生成，避免每次渲染跳动。 */
function waveHeights(seed: string) {
  const base = [8, 15, 22, 12, 18, 26, 11, 20, 14, 24, 9, 17, 21, 13, 25, 10, 19, 16, 23, 12]
  const offset = seed.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return base.map((height, i) => Math.max(6, (height + offset + i * 3) % 26))
}

/** 图片块展示地址：本地预览优先，其次已上传地址。 */
const blockSrc = useNoteMedia(() => store.account.value, () => blocks.value)

function play(block: NoteBlock) {
  const src = blockSrc(block)
  if (!src) { toast('语音尚未加载或已失效'); return }
  player?.destroy()
  player = uni.createInnerAudioContext()
  player.src = src
  playingId.value = block.id
  player.onEnded(() => { playingId.value = '' })
  player.onError(() => { playingId.value = ''; toast('语音播放失败') })
  player.play()
}



function editNote() {
  moreOpen.value = false
  if (note.value) uni.navigateTo({ url: `${ROUTES.noteEdit}?id=${note.value.id}` })
}

function editRemark(remark: BookNode) {
  draftRemark.value = bodyOf(remark)
  toast('编辑备注：修改后按发送保存为新的子备注')
}

function reply(remark: BookNode) {
  draftRemark.value = '@' + bodyOf(remark).slice(0, 8) + '… '
}

function openRemark(remark: BookNode) {
  uni.navigateTo({ url: `${ROUTES.remark}?id=${remark.id}` })
}

function openBook() {
  if (book.value) uni.navigateTo({ url: `${ROUTES.book}?id=${book.value.id}` })
}

function openCategory() {
  if (category.value) uni.navigateTo({ url: `${ROUTES.category}?id=${category.value.id}` })
  else goHome()
}

/** 新增一条备注：作为当前感悟的直接子节点。 */
async function submitRemark() {
  const text = draftRemark.value.trim()
  if (!text || posting.value || !note.value) return
  posting.value = true
  try {
    await saveNode({
      id: newRemarkId(),
      parentId: note.value.id,
      nodeType: 'remark',
      title: text.slice(0, 40),
      sortOrder: remarks.value.length + 1,
      version: undefined
    } as BookNode, JSON.stringify({ text }))
    draftRemark.value = ''
    toast('已添加备注')
    await load()
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '保存失败')
  } finally {
    posting.value = false
  }
}

/** 生成备注 ID（合法 UUID）。 */
function newRemarkId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const digit = Math.floor(Math.random() * 16)
    return (char === 'x' ? digit : (digit & 3) | 8).toString(16)
  })
}

/** 导出单条感悟（含正文块与子备注）为 Markdown。 */
function exportNote() {
  moreOpen.value = false
  if (!note.value) return
  saveMarkdown(`${note.value.title}.md`, noteMarkdown(note.value, book.value, tree.value))
  toast('已导出为 Markdown')
}

function copyNote() {
  moreOpen.value = false
  const text = blocks.value.map(block => block.text || block.caption || '').filter(Boolean).join('\n\n')
  uni.setClipboardData({ data: text || note.value?.title || '' })
  toast('已复制这条感悟的文字内容')
}

function moreToast(message: string) {
  moreOpen.value = false
  toast(message)
}

async function removeNote() {
  moreOpen.value = false
  if (!note.value) return
  const related = remarks.value.length
  const confirmed = await new Promise<boolean>(resolve => {
    uni.showModal({
      title: '删除这条感悟？',
      content: related ? `会同时删除其下 ${related} 条备注` : '删除后无法恢复',
      confirmText: '确认删除',
      success: result => resolve(result.confirm),
      fail: () => resolve(false)
    })
  })
  if (!confirmed) return
  try {
    await removeNode(noteId.value)
    toast('已删除')
    if (book.value) uni.redirectTo({ url: `${ROUTES.book}?id=${book.value.id}` })
    else goHome()
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '删除失败')
  }
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
    const [rows, node] = await Promise.allSettled([fetchNodes({ tree: true }), fetchNode(noteId.value)])
    if (rows.status === 'fulfilled') tree.value = rows.value
    if (node.status === 'fulfilled') detail.value = node.value
    else if (node.reason instanceof ApiError && node.reason.status === 0) {
      detail.value = tree.value.find(item => item.id === noteId.value && item.contentJson !== undefined)
      if (!detail.value) throw node.reason
    } else {
      detail.value = undefined
      throw node.reason
    }
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onLoad(options => {
  noteId.value = pageOption('id', (options?.id as string) || '')
  if (requireLogin()) void load()
})
onShow(() => {
  if (store.token.value) void load()
})
onUnload(() => player?.destroy())
</script>

<style scoped>
.scroll {
  flex: 1;
  min-height: 0;
  padding: 0 0 12px;
  box-sizing: border-box;
}

/* 内容不足一屏时也让内容区铺满，避免列表与输入框之间露出空白 */
.scroll > :deep(.uni-scroll-view) {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.note-head { padding: 2px 16px 14px; }
.note-head .meta { display: flex; align-items: center; gap: 8px; font-size: 10.5px; color: var(--ink-400); }
.note-title {
  display: block;
  margin: 7px 0 0;
  font-family: var(--serif);
  font-size: 20px;
  font-weight: 650;
  line-height: 1.4;
  letter-spacing: -0.2px;
}
.chapter-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
  font-size: 11px;
  color: var(--wood-700);
  background: var(--wood-100);
  padding: 2px 9px;
  border-radius: 999px;
}

.block-wrap { padding: 0 16px 6px; }

/* 正文卡片：白纸浮起，与备注区的米色底拉开层次 */
.block-card {
  padding: 16px 15px;
  border-radius: 14px;
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-card);
}

.block { padding: 2px 0; }
.block + .block { margin-top: 10px; }
.block-text { padding: 0; }

/* 备注区：与正文用一条渐隐分隔线 + 小标题色带隔开 */
.remark-section {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--line);
  background: transparent;
}

.remark-head { padding: 0 16px 4px; }
.remark-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--serif);
  font-size: 14px;
  font-weight: 650;
  color: var(--ink-800);
}
.remark-title::before {
  content: "";
  width: 3px;
  height: 13px;
  border-radius: 2px;
  background: var(--wood-500);
}
.remark-list { padding: 6px 16px 12px; }

/* 单条备注做成轻卡片，长列表里也更容易分辨 */
.remark-item {
  padding: 12px 13px;
  margin-top: 8px;
  border-radius: 11px;
  background: var(--surface);
  border: 1px solid var(--line);
}
.remark-item:first-child { margin-top: 2px; }
.remark-body { margin: 7px 0 0; font-size: 13px; line-height: 1.78; color: var(--ink-700); }
.remark-foot { margin: 8px 0 0; }

/* 内容不足一屏时把剩余空间吃掉，避免列表和输入框之间悬空 */
.scroll-filler { flex: 1 1 auto; min-height: 0; }
.remark-foot .foot-btn { display: inline-flex; align-items: center; gap: 4px; }
.link { color: var(--wood-700); }

.error-tip {
  margin: 6px 16px 10px;
  padding: 9px 12px;
  border-radius: 9px;
  background: var(--red-100);
  color: var(--red-700);
  font-size: 12px;
}
</style>
