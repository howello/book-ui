<template>
  <AppPage :loading="loading" title="我的">
    <scroll-view class="scroll" scroll-y>
      <view class="profile card">
        <view class="avatar-lg">我</view>
        <view class="grow">
          <text class="profile-name">读书账号</text>
        </view>
        <button class="btn xs line" @click="logout">退出登录</button>
      </view>

      <view class="card">
        <view class="between">
          <text class="row-title">书架概况</text>
          <text class="tiny">{{ stats.categories }} 分类 · {{ stats.books }} 本 · {{ stats.notes }} 感悟</text>
        </view>
      </view>

      <view class="card">
        <text class="row-title">外观</text>
        <view class="theme-row">
          <button
            v-for="(label, index) in theme.labels"
            :key="label"
            class="theme-chip"
            :class="{ on: theme.index === index }"
            @click="theme.set(index)"
          >
            {{ label }}
          </button>
        </view>
      </view>

      <view class="card">
        <text class="row-title">离线数据</text>
        <view class="data-row">
          <text class="tiny">已缓存页面</text>
          <text class="data-value">{{ cacheCount }} 个</text>
        </view>
        <view class="data-row">
          <text class="tiny">待保存草稿</text>
          <text class="data-value">{{ drafts.length }} 条</text>
        </view>
        <view v-for="draft in drafts" :key="draft.id" class="draft-row" @click="continueDraft(draft)">
          <view class="grow">
            <text class="draft-title">{{ draft.title }}</text>
            <text class="tiny">{{ TYPE_NAMES[draft.nodeType as NodeType] || '感悟' }} · {{ dateText(draft.savedAt) }}</text>
          </view>
          <button class="draft-del" :aria-label="'删除草稿 ' + draft.title" @click.stop="removeDraft(draft)">
            <AppIcon name="trash" :size="13" />
          </button>
          <AppIcon name="chev" :size="12" />
        </view>
        <button class="btn line cache-btn" @click="clearCache">清理本机缓存</button>
      </view>

      <view class="card">
        <view class="link-row" role="button" @click="openAbout">
          <text class="row-title">关于读书笔记</text>
          <AppIcon name="chev" :size="13" />
        </view>
      </view>
    </scroll-view>

    <template #footer><AppTabbar current="mine" /></template>
    <AppToast />
  </AppPage>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import AppToast from '../../components/AppToast.vue'
import AppTabbar from '../../components/AppTabbar.vue'
import AppIcon from '../../components/AppIcon.vue'
import { bookStoragePrefix } from '../../api-env'
import { ROUTES } from '../../shared/navigation'
import { clearSession, fetchNodes, shelfStats, useBookStore, useTheme } from '../../shared/store'
import type { BookNode } from '../../shared/types'
import { requireLogin } from '../../shared/use-book'
import { toast } from '../../shared/toast'
import { clearDraft, listDrafts, type DraftSummary } from '../../shared/draft'
import { TYPE_NAMES } from '../../shared/store'
import type { NodeType } from '../../shared/types'

const store = useBookStore()
const theme = useTheme()
const tree = ref<BookNode[]>([])
const cacheCount = ref(0)
const drafts = ref<DraftSummary[]>([])

const stats = computed(() => shelfStats(tree.value))

/** 缓存与草稿按当前账号统计，切换账号后立即变化。 */
function refreshStorage() {
  const owner = store.account.value
  const keys = uni.getStorageInfoSync().keys
  cacheCount.value = keys.filter(key => key.startsWith(`${bookStoragePrefix}-cache:${owner}:`)).length
  drafts.value = listDrafts(owner)
}

/** 草稿保存时间显示为「MM-DD HH:mm」。 */
function dateText(time: number) {
  if (!time) return ''
  const date = new Date(time)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** 删除单条草稿：只清本机记录，不涉及服务器数据。 */
async function removeDraft(draft: DraftSummary) {
  const confirmed = await new Promise<boolean>(resolve => {
    uni.showModal({
      title: '删除这条草稿？',
      content: '只删除本机未提交的内容，已保存的节点不受影响',
      confirmText: '删除',
      confirmColor: '#8C3B2E',
      success: result => resolve(result.confirm),
      fail: () => resolve(false)
    })
  })
  if (!confirmed) return
  clearDraft(store.account.value, draft.id)
  drafts.value = listDrafts(store.account.value)
  toast('草稿已删除')
}

/** 继续编辑草稿：感悟草稿回到写感悟页，其余类型先跳对应列表页。 */
function continueDraft(draft: DraftSummary) {
  const target = draft.nodeType === 'note'
    ? (draft.id.startsWith('new:') ? '/pages/note/edit?parentId=' : '/pages/note/edit?id=')
    : '/pages/home/index'
  const url = draft.nodeType === 'note' && !draft.id.startsWith('new:') ? target + draft.id : target
  uni.navigateTo({ url })
}

function openAbout() {
  uni.navigateTo({ url: '/pages/about/index' })
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
  } catch {
    tree.value = []
  } finally {
    loading.value = false
  }
  refreshStorage()
}

function clearCache() {
  const owner = store.account.value
  const keys = uni.getStorageInfoSync().keys
  let removed = 0
  for (const key of keys) {
    if (key.startsWith(`${bookStoragePrefix}-cache:${owner}:`)) {
      uni.removeStorageSync(key)
      removed += 1
    }
  }
  refreshStorage()
  toast(removed ? `已清理 ${removed} 个缓存页面` : '没有可清理的缓存')
}

function logout() {
  uni.showModal({
    title: '退出登录？',
    content: '本机缓存会保留，下次登录同一账号可继续使用',
    success: result => {
      if (!result.confirm) return
      clearSession()
      uni.reLaunch({ url: ROUTES.login })
    }
  })
}

onShow(() => {
  if (requireLogin()) void load()
})
</script>

<style scoped>
.scroll {
  flex: 1;
  min-height: 0;
  padding: 6px 16px 8px;
  box-sizing: border-box;
}

.profile { display: flex; align-items: center; gap: 12px; }
.avatar-lg {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  border-radius: 50%;
  background: var(--wood-200);
  color: var(--wood-900);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
}
.profile-name { display: block; font-family: var(--serif); font-size: 15px; font-weight: 600; }
.row-title { font-size: 13px; font-weight: 650; }

.theme-row { display: flex; gap: 7px; margin-top: 10px; }
.theme-chip {
  flex: 1;
  height: 34px;
  border-radius: 9px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink-500);
  font-size: 12px;
  margin: 0;
  line-height: 32px;
}
.theme-chip.on { border-color: var(--wood-600); background: var(--wood-100); color: var(--wood-900); font-weight: 600; }

.data-row { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; }
.data-value { font-size: 12.5px; color: var(--ink-700); font-weight: 600; }
.cache-btn { margin-top: 12px; }

.draft-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 9px 10px;
  border-radius: 9px;
  background: var(--surface-2);
  border: 1px solid var(--line);
}
.draft-del {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--ink-400);
  display: flex;
  align-items: center;
  justify-content: center;
}
.draft-del:active { background: var(--red-100); color: var(--red-700); }

.draft-title {
  display: block;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-800);
  margin-bottom: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-row { display: flex; align-items: center; justify-content: space-between; color: var(--ink-700); }
</style>
