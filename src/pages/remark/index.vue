<template>
  <AppPage :loading="loading" skeleton="detail" :title="remark ? '备注' : '备注'" :subtitle="depthLabel" back>
    <template #action>
      <button class="act" aria-label="更多" @click="moreOpen = true">
        <AppIcon name="more" :size="20" />
      </button>
    </template>
    <template #path>
      <text class="link" @click="openRoot">感悟</text>
      <template v-for="(row, index) in chain" :key="row.id">
        <text class="sep">/</text>
        <text v-if="index < chain.length - 1" class="link" @click="openRemark(row)">第 {{ index + 1 }} 层</text>
        <text v-else class="cur">第 {{ index + 1 }} 层</text>
      </template>
    </template>

    <scroll-view class="scroll" scroll-y>
      <view v-if="error" class="error-tip">{{ error }}</view>

      <view v-if="remark" class="rp-head">
        <view class="row">
          <text class="depth-chip">
            <AppIcon name="layers" :size="11" />
            备注第 {{ depth }} 层
          </text>
          <text class="tiny">{{ timeOf(remark) }}</text>
        </view>
        <text class="rp-text">{{ bodyOf(remark) }}</text>
        <view v-if="sourceText" class="quote-src">
          <text class="quote-label">{{ sourceLabel }}</text>
          <text class="quote-text">{{ sourceText }}</text>
        </view>
        <view class="rp-owner">
          <view class="avatar">我</view>
          <text>我 · 创建于 {{ (remark.createdAt || '').slice(5, 10) }}</text>
          <view class="grow" />
          <text>{{ children.length }} 条子备注</text>
        </view>
      </view>

      <view class="children-head">
        <view class="hr" />
        <view class="between">
          <text class="children-title">子备注 <text class="muted">{{ children.length }}</text></text>
          <SortMenu :options="remarkSortLabels" :index="remarkSortIndex" @change="setRemarkSort" />
        </view>
      </view>

      <view class="children">
        <view v-for="child in children" :key="child.id" class="child">
          <view class="child-hd">
            <view class="avatar">我</view>
            <text class="name">我</text>
            <text>·</text>
            <text>{{ timeOf(child) }}</text>
          </view>
          <text class="child-body">{{ bodyOf(child) }}</text>
          <view class="child-foot">
            <view class="foot-btn" @click="reply(child)"><AppIcon name="corner" :size="12" /><text>回复</text></view>
            <view class="foot-btn" @click="openRemark(child)"><AppIcon name="layers" :size="12" /><text>进入这一层</text></view>
          </view>
          <view v-if="grandchildrenOf(child).length" class="child-tail" @click="openRemark(child)">
            <AppIcon name="corner" :size="12" />
            <text>{{ grandchildrenOf(child).length }} 条子备注 · 进入第 {{ depth + 1 }} 层</text>
          </view>
        </view>

        <view v-if="!children.length" class="empty">
          <AppIcon name="corner" :size="30" />
          <text class="empty-text">这一层还没有子备注，往下写一条即可继续嵌套</text>
        </view>
      </view>

      <text class="tiny level-tail">每一层都能继续加备注，层数不设上限</text>
      <view class="scroll-filler" />
    </scroll-view>



    <AppSheet v-model="moreOpen" title="这条备注" :subtitle="`备注第 ${depth} 层 · ${children.length} 条子备注`">
      <button class="btn line sheet-btn" @click="copyRemark">
        <AppIcon name="note" :size="13" />复制
      </button>
      <button class="btn line sheet-btn" @click="moreToast('已置顶到感悟下第一条')">
        <AppIcon name="move-up" :size="13" />置顶
      </button>
      <button class="btn line sheet-btn danger" @click="removeRemark">
        <AppIcon name="trash" :size="13" />删除备注及其子备注
      </button>
    </AppSheet>
    <AppToast />
    <template #footer v-if="!loading">
    <view class="composer">
      <input v-model="draft" class="input" placeholder="回复这条备注…" confirm-type="send" @confirm="submit" />
      <button class="send" aria-label="发送" :disabled="posting" @click="submit">
        <AppIcon name="send" :size="16" />
      </button>
    </view>
    </template>
</AppPage>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import AppToast from '../../components/AppToast.vue'
import AppIcon from '../../components/AppIcon.vue'
import SortMenu from '../../components/SortMenu.vue'
import AppSheet from '../../components/AppSheet.vue'
import { ROUTES, goHome } from '../../shared/navigation'
import { ancestorsOf, fetchNodes, removeNode, useBookStore } from '../../shared/store'
import type { BookNode } from '../../shared/types'
import { parseContent } from '../../shared/types'
import { pageOption, requireLogin, saveNode } from '../../shared/use-book'
import { toast } from '../../shared/toast'

const store = useBookStore()
const remarkId = ref('')
const tree = ref<BookNode[]>([])
const error = ref('')
/** 备注排序：最新在前 / 最早在前 / 按层级（层级内再按时间）。 */
const remarkSortLabels = ['最新在前', '最早在前', '按层级']
const remarkSortIndex = ref(0)

/** 备注排序：0 最新 / 1 最早 / 2 按层级。 */
function setRemarkSort(index: number) {
  remarkSortIndex.value = index
}
const moreOpen = ref(false)
const draft = ref('')
const posting = ref(false)

const remark = computed(() => tree.value.find(node => node.id === remarkId.value))
const children = computed(() => tree.value
  .filter(node => node.parentId === remarkId.value && node.nodeType === 'remark')
  .sort((a, b) => {
    const byTime = (a.createdAt || '').localeCompare(b.createdAt || '')
    const byOrder = (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    if (remarkSortIndex.value === 1) return byTime || byOrder
    if (remarkSortIndex.value === 2) return byOrder || byTime
    return -byTime || byOrder
  }))

/** 祖先链（由近到远，不含自身）。 */
const ancestors = computed(() => remark.value ? ancestorsOf(tree.value, remark.value.id) : [])

/** 备注链（由远到近，含自身）：感悟是第 0 层，第一条备注为第 1 层。 */
const chain = computed(() => {
  if (!remark.value) return [] as BookNode[]
  const parents = ancestors.value.filter(node => node.nodeType === 'remark')
  return [...parents.reverse(), remark.value]
})

/** 当前备注挂在感悟下，还是挂在另一条备注下。 */
const parentRemark = computed(() => ancestors.value.find(node => node.nodeType === 'remark'))
const rootNote = computed(() => ancestors.value.find(node => node.nodeType === 'note'))

/** 当前备注的真实层级：感悟下的第一条备注为第 1 层。 */
const depth = computed(() => chain.value.length)

const depthLabel = computed(() => `相对感悟 · 第 ${depth.value} 层`)

const sourceLabel = computed(() => parentRemark.value
  ? `回复自 · 备注（第 ${depth.value - 1} 层）`
  : rootNote.value ? `感悟《${rootNote.value.title}》` : '')

const sourceText = computed(() => {
  const source = parentRemark.value || rootNote.value
  return source ? bodyOf(source) : ''
})

function bodyOf(node: BookNode) {
  return parseContent(node).text || node.title
}

function timeOf(node: BookNode) {
  const time = node.createdAt || node.updatedAt || ''
  return time ? time.slice(5, 16).replace('T', ' ') : ''
}

function grandchildrenOf(node: BookNode) {
  return tree.value.filter(item => item.parentId === node.id && item.nodeType === 'remark')
}

function openRemark(node: BookNode) {
  if (node.id === remarkId.value) return
  uni.navigateTo({ url: `${ROUTES.remark}?id=${node.id}` })
}

function openRoot() {
  if (rootNote.value) uni.navigateTo({ url: `${ROUTES.note}?id=${rootNote.value.id}` })
  else goHome()
}

function reply(child: BookNode) {
  draft.value = '@' + bodyOf(child).slice(0, 8) + '… '
}

/** 新增子备注：挂到当前备注下，层数自动加一。 */
async function submit() {
  const text = draft.value.trim()
  if (!text || posting.value || !remark.value) return
  posting.value = true
  try {
    await saveNode({
      id: newRemarkId(),
      parentId: remark.value.id,
      nodeType: 'remark',
      title: text.slice(0, 40),
      sortOrder: children.value.length + 1
    } as BookNode, JSON.stringify({ text }))
    draft.value = ''
    toast('已添加子备注')
    await load()
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '保存失败')
  } finally {
    posting.value = false
  }
}

function newRemarkId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const digit = Math.floor(Math.random() * 16)
    return (char === 'x' ? digit : (digit & 3) | 8).toString(16)
  })
}

function copyRemark() {
  moreOpen.value = false
  uni.setClipboardData({ data: remark.value ? bodyOf(remark.value) : '' })
  toast('已复制备注内容')
}

function moreToast(message: string) {
  moreOpen.value = false
  toast(message)
}

async function removeRemark() {
  moreOpen.value = false
  if (!remark.value) return
  const confirmed = await new Promise<boolean>(resolve => {
    uni.showModal({
      title: '删除这条备注？',
      content: children.value.length ? '会同时删除其下全部子备注' : '删除后可在回收站恢复',
      confirmText: '确认删除',
      success: result => resolve(result.confirm),
      fail: () => resolve(false)
    })
  })
  if (!confirmed) return
  try {
    await removeNode(remarkId.value)
    toast('已移入回收站')
    const parent = parentRemark.value
    if (parent) uni.redirectTo({ url: `${ROUTES.remark}?id=${parent.id}` })
    else if (rootNote.value) uni.redirectTo({ url: `${ROUTES.note}?id=${rootNote.value.id}` })
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
    tree.value = await fetchNodes({ tree: true })
    if (!remark.value && remarkId.value) error.value = '备注不存在或已删除'
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '加载失败'
  } finally {
    loading.value = false
  }
}

onLoad(options => {
  remarkId.value = pageOption('id', (options?.id as string) || '')
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
  padding: 0 0 12px;
  box-sizing: border-box;
}

/* 内容不足一屏时也让内容区铺满，避免列表与输入框之间露出空白 */
.scroll > :deep(.uni-scroll-view) {
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.rp-head { padding: 2px 16px 14px; }
.depth-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  color: var(--wood-900);
  background: var(--wood-100);
  border: 1px solid var(--wood-200);
  border-radius: 999px;
  padding: 2px 8px;
}
.rp-text {
  display: block;
  margin: 10px 0 0;
  font-size: 14.5px;
  line-height: 1.8;
  color: var(--ink-900);
}
.quote-src {
  margin: 8px 0 0;
  padding: 10px 12px;
  border-left: 2.5px solid var(--wood-300);
  background: var(--surface-2);
  border-radius: 0 8px 8px 0;
  font-size: 12.5px;
  color: var(--ink-600);
  line-height: 1.75;
}
.quote-label { display: block; font-size: 10.5px; color: var(--ink-400); font-weight: 500; margin-bottom: 3px; }
.quote-text { display: block; }
.rp-owner { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 11px; color: var(--ink-400); }
.rp-owner .avatar { width: 22px; height: 22px; flex: 0 0 22px; font-size: 10px; }

.children-head { padding: 0 16px; }
.children-head .hr { margin: 0 0 2px; }
.children-title { font-size: 13px; font-weight: 650; }
.children { padding: 2px 16px 12px; }
.foot-btn { display: inline-flex; align-items: center; gap: 4px; }
.level-tail { display: block; text-align: center; padding: 10px 0 4px; }

/* 内容不足一屏时把剩余空间吃掉，避免列表和输入框之间悬空 */
.scroll-filler { flex: 1 1 auto; min-height: 0; }
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
