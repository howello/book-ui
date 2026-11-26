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
          <text class="tiny">感悟同步</text>
          <text class="data-value">{{ syncStatus }}</text>
        </view>
        <view v-for="entry in problems" :key="entry.node.id" class="sync-row">
          <view class="grow" @click="openPending(entry)">
            <text class="sync-title">{{ entry.node.title }}</text>
            <text class="tiny">{{ entry.problem }}</text>
          </view>
          <button v-if="entry.problemCode === 409" class="btn xs line" @click="resolveConflict(entry)">处理</button>
        </view>
        <button class="btn line cache-btn" @click="clearCache">清理本机缓存</button>
      </view>

      <view class="card">
        <view class="link-row" role="button" @click="openAbout">
          <text class="row-title">关于悟</text>
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
import { pendingNotes, type PendingNote } from '../../shared/pending-notes'
import { noteSyncOffline, noteSyncRunning, retryPendingNote } from '../../shared/note-sync'

const store = useBookStore()
const theme = useTheme()
const tree = ref<BookNode[]>([])
const cacheCount = ref(0)
const pending = computed(() => pendingNotes(store.account.value))
const problems = computed(() => pending.value.filter(entry => entry.problem))
const syncStatus = computed(() => {
  if (noteSyncOffline.value) return `离线 · ${pending.value.length} 条待上传`
  if (noteSyncRunning.value) return `正在同步 · ${pending.value.length} 条`
  if (pending.value.length) return `${pending.value.length} 条待上传`
  return '已同步'
})

const stats = computed(() => shelfStats(tree.value))

/** 缓存按当前账号统计。 */
function refreshStorage() {
  const owner = store.account.value
  const keys = uni.getStorageInfoSync().keys
  cacheCount.value = keys.filter(key => key.startsWith(`${bookStoragePrefix}-cache:${owner}:`)).length
}

function openPending(entry: PendingNote) {
  uni.navigateTo({ url: `${ROUTES.noteEdit}?id=${entry.node.id}` })
}

function resolveConflict(entry: PendingNote) {
  uni.showModal({
    title: '使用本机版本？',
    content: '云端已有其他修改。确认后将用本机内容覆盖云端版本。',
    confirmText: '使用本机',
    success: result => {
      if (result.confirm) void retryPendingNote(entry.node.id).catch(error => toast(error.message))
    }
  })
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

.sync-row { display: flex; align-items: center; gap: 8px; padding-top: 10px; }
.sync-title { display: block; font-size: 13px; color: var(--ink-800); }
</style>
