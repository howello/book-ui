<template>
  <AppPage :loading="loading && !profile" title="我的">
    <scroll-view class="scroll" scroll-y>
      <view class="profile card">
        <view class="avatar-lg">
          <image v-if="avatarSrc && !avatarFailed" :key="avatarSrc" class="avatar-image" :src="avatarSrc"
            mode="aspectFill" aria-label="用户头像" @error="avatarFailed = true" />
          <text v-else aria-hidden="true">{{ avatarInitial }}</text>
        </view>
        <view class="grow profile-info">
          <text class="profile-name">{{ profileName || '读书账号' }}</text>
          <text v-if="profile?.userName && profile.userName !== profileName" class="profile-account">@{{ profile.userName }}</text>
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
          <text class="tiny">上传进度</text>
          <text class="data-value">{{ syncStatus }}</text>
        </view>
        <progress v-if="uploadProgress.total" :percent="uploadPercent" :stroke-width="4" />
        <view class="data-row">
          <text class="tiny">更新进度</text>
          <text class="data-value">{{ downloadStatus }}</text>
        </view>
        <progress v-if="downloadProgress.total" :percent="downloadPercent" :stroke-width="4" />
        <view v-if="mediaProgress.total" class="data-row">
          <text class="tiny">图片与录音</text>
          <text class="data-value">{{ mediaProgress.completed }} / {{ mediaProgress.total }}{{ mediaProgress.failed ? ` · ${mediaProgress.failed} 项失败` : '' }}</text>
        </view>
        <progress v-if="mediaProgress.total" :percent="mediaPercent" :stroke-width="4" />
        <view v-for="entry in problems" :key="entry.node.id" class="sync-row">
          <view class="grow" @click="openPending(entry)">
            <text class="sync-title">{{ entry.node.title }}</text>
            <text class="tiny">{{ entry.problem }}</text>
          </view>
          <button v-if="entry.problemCode === 409" class="btn xs line" @click="resolveConflict(entry)">处理</button>
        </view>
        <button class="btn line cache-btn"  :disabled="clearing" @click="clearCache">{{ clearing ? '正在清理…' : '清理本地缓存' }}</button>
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
import { computed, ref, watch } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import AppToast from '../../components/AppToast.vue'
import AppTabbar from '../../components/AppTabbar.vue'
import AppIcon from '../../components/AppIcon.vue'
import { baseApi } from '../../api-env'
import { ROUTES, routeForNode } from '../../shared/navigation'
import { cachedScopeCount, clearOfflineCache, clearSession, downloadProgress, fetchShelfStats, refreshAccountProfile, useBookStore, useTheme } from '../../shared/store'
import { requireLogin } from '../../shared/use-book'
import { toast } from '../../shared/toast'
import { pendingNotes, type PendingNote } from '../../shared/pending-notes'
import { mediaProgress } from '../../shared/scope-media'
import { noteSyncOffline, noteSyncRunning, retryPendingNote, uploadProgress } from '../../shared/note-sync'

const store = useBookStore()
const profile = store.profile
const profileName = computed(() => profile.value?.nickName || profile.value?.userName || '')
const avatarInitial = computed(() => Array.from(profileName.value)[0] || '我')
const avatarSrc = computed(() => {
  const avatar = profile.value?.avatar
  if (!avatar) return ''
  if (/^https?:\/\//i.test(avatar)) return avatar
  return `${baseApi()}/${avatar.replace(/^\/+/, '')}`
})
const avatarFailed = ref(false)
watch(avatarSrc, () => { avatarFailed.value = false })

const theme = useTheme()
const stats = ref({ categories: 0, books: 0, notes: 0, weekNotes: 0 })
const clearing = ref(false)
const cacheCount = ref(0)
const pending = computed(() => pendingNotes(store.account.value))
const problems = computed(() => pending.value.filter(entry => entry.problem))
const syncStatus = computed(() => {
  if (noteSyncOffline.value) return `离线 · ${pending.value.length} 条待上传`
  if (noteSyncRunning.value) return `正在上传 · ${uploadProgress.value.completed} / ${uploadProgress.value.total}`
  if (pending.value.length) return `${pending.value.length} 条待上传`
  return '已同步'
})

const percent = (done: number, total: number) => total ? Math.min(100, Math.round(done * 100 / total)) : 0
const uploadPercent = computed(() => percent(uploadProgress.value.completed, uploadProgress.value.total))
const downloadPercent = computed(() => percent(downloadProgress.completed, downloadProgress.total))
const mediaPercent = computed(() => percent(mediaProgress.value.completed, mediaProgress.value.total))
const downloadStatus = computed(() => {
  if (downloadProgress.running) return `正在更新 · ${downloadProgress.completed} / ${downloadProgress.total} 层`
  if (noteSyncOffline.value) return '离线'
  if (downloadProgress.problem) return downloadProgress.problem
  if (downloadProgress.updatedAt) return `已更新 · ${downloadProgress.changed} 条变化`
  return '等待更新'
})

async function refreshStorage() {
  const owner = store.account.value
  const count = await cachedScopeCount(owner)
  if (owner === store.account.value) cacheCount.value = count
}

watch(() => downloadProgress.updatedAt, () => void refreshStorage())

function openPending(entry: PendingNote) {
  if (entry.operation === 'delete') return
  const url = entry.node.nodeType === 'note' ? `${ROUTES.noteEdit}?id=${entry.node.id}` : routeForNode(entry.node)
  uni.navigateTo({ url })
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
    stats.value = await fetchShelfStats(value => { stats.value = value; loading.value = false })
  } catch {
    // 离线时保留上次的书架概况。
  } finally {
    loading.value = false
  }
  refreshStorage()
}

function clearCache() {
  if (clearing.value) return
  uni.showModal({
    title: '清理本地缓存？',
    content: '会清除已下载的节点、封面和录音。待上传的修改、附件和草稿会保留。',
    confirmText: '清理',
    async success(result) {
      if (!result.confirm || clearing.value) return
      clearing.value = true
      try {
        await clearOfflineCache(store.account.value)
        await refreshStorage()
        toast('已清理本地缓存')
      } catch {
        toast('清理未完成，请重试')
      } finally {
        clearing.value = false
      }
    }
  })
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
  if (!requireLogin()) return
  avatarFailed.value = false
  void refreshAccountProfile().catch(() => { if (!store.token.value) requireLogin() })
  void load()
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
  overflow: hidden;
  background: var(--wood-200);
  color: var(--wood-900);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
}
.avatar-image { width: 100%; height: 100%; display: block; }
.profile-info { min-width: 0; }
.profile-name,
.profile-account { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.profile-name { font-family: var(--serif); font-size: 15px; font-weight: 600; }
.profile-account { margin-top: 3px; font-size: 12px; color: var(--ink-500); }
.profile .btn { flex-shrink: 0; }
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
