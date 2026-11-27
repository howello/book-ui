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

      <view v-if="weread" class="card">
        <view class="between">
          <text class="row-title">微信读书</text>
          <button class="btn xs line" :disabled="startingWeRead || wereadTask?.state === 'running' || !weread.configured"
            @click="syncWeRead">{{ startingWeRead || wereadTask?.state === 'running' ? '同步中…' : '同步微信读书' }}</button>
        </view>
        <text class="tiny weread-status" role="status">{{ wereadMessage }}</text>
        <progress v-if="wereadTask?.state === 'running' && wereadTask.total"
          :percent="percent(wereadTask.completed, wereadTask.total)" :stroke-width="4" />
        <text v-if="wereadTask?.state === 'running' && wereadTask.total" class="tiny weread-status">
          已处理 {{ wereadTask.completed }} / {{ wereadTask.total }} 本
        </text>
        <text v-else-if="wereadTask && wereadTask.state !== 'running'" class="tiny weread-status">
          新增 {{ wereadTask.categories }} 个分类 · {{ wereadTask.books }} 本书 · {{ wereadTask.notes }} 条感悟
          {{ wereadTask.failed ? ` · ${wereadTask.failed} 本失败` : '' }}
        </text>
      </view>

      <view class="card">
        <text class="row-title">外观</text>
        <view class="theme-row">
          <button
            v-for="(label, index) in theme.labels"
            :key="label"
            class="theme-chip"
            :class="{ on: theme.index === index }"
            :aria-pressed="theme.index === index"
            @click="theme.set(index)"
          >
            {{ label }}
          </button>
        </view>
      </view>

      <view class="card">
        <text class="row-title">离线数据</text>
        <view class="local-data">
          <text class="tiny">本地数据数量</text>
          <view class="local-counts">
            <view v-for="(label, type) in TYPE_NAMES" :key="type" class="local-count">
              <text class="local-value">{{ localCounts[type] }}</text>
              <text class="tiny">{{ label }}</text>
            </view>
          </view>
        </view>
        <view class="data-row">
          <text class="tiny">上传进度</text>
          <text class="data-value">{{ syncStatus }}</text>
        </view>
        <progress v-if="uploadProgress.total" :percent="uploadPercent" :stroke-width="4" />
        <view class="data-row">
          <text class="tiny">下载进度</text>
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
        <view class="cache-actions">
          <button class="btn xs line" :disabled="clearing" @click="clearCache">{{ clearing ? '正在清理…' : '清理本地缓存' }}</button>
        </view>
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
import { computed, ref, shallowRef, watch } from 'vue'
import { onHide, onShow, onUnload } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import AppToast from '../../components/AppToast.vue'
import AppTabbar from '../../components/AppTabbar.vue'
import AppIcon from '../../components/AppIcon.vue'
import { baseApi } from '../../api-env'
import { ROUTES, routeForNode } from '../../shared/navigation'
import { TYPE_NAMES, clearOfflineCache, clearSession, countOfflineNodes, downloadProgress, fetchShelfStats, readOfflineNodes, refreshAccountProfile, refreshActiveScope, request, useBookStore, useTheme, type OfflineNode } from '../../shared/store'
import { requireLogin } from '../../shared/use-book'
import { toast } from '../../shared/toast'
import { pendingNotes, type PendingNote } from '../../shared/pending-notes'
import { mediaProgress } from '../../shared/scope-media'
import { flushPendingUploads, noteSyncOffline, noteSyncRunning, retryPendingNote, uploadProgress } from '../../shared/note-sync'

interface WeReadTask {
  id: string
  state: 'running' | 'succeeded' | 'partial' | 'failed'
  total: number
  completed: number
  categories: number
  books: number
  notes: number
  failed: number
  message: string
}

interface WeReadStatus {
  configured: boolean
  task?: WeReadTask | null
}

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
const localNodes = shallowRef<OfflineNode[]>([])
const pending = computed(() => pendingNotes(store.account.value))
const localCounts = computed(() => countOfflineNodes(localNodes.value, pending.value))
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
  if (downloadProgress.running) return `正在下载 · ${downloadProgress.completed} / ${downloadProgress.total} 层`
  if (noteSyncOffline.value) return '离线'
  if (downloadProgress.problem) return downloadProgress.problem
  if (downloadProgress.updatedAt) return `已更新 · ${downloadProgress.changed} 条变化`
  return '等待下载'
})

const weread = ref<WeReadStatus>()
const wereadTask = computed(() => weread.value?.task)
const startingWeRead = ref(false)
const wereadError = ref('')
const wereadMessage = computed(() => {
  if (wereadError.value) return wereadError.value
  if (!weread.value?.configured) return '请在管理端参数设置中配置微信读书 API Key'
  if (startingWeRead.value) return '正在上传本地修改并提交同步任务…'
  return wereadTask.value?.message || '每天 05:00 自动同步'
})
const wereadPath = '/book/weread/sync'
let wereadTimer: ReturnType<typeof setTimeout> | undefined
let wereadEpoch = 0

function clearWeReadTimer() {
  if (wereadTimer !== undefined) clearTimeout(wereadTimer)
  wereadTimer = undefined
}

function applyWeReadStatus(value: WeReadStatus) {
  const previous = wereadTask.value
  const task = value.task
  weread.value = value
  wereadError.value = ''
  clearWeReadTimer()
  if (task?.state === 'running') {
    wereadTimer = setTimeout(() => void readWeReadStatus(), 2000)
  } else if (task && (previous?.id !== task.id || previous.state === 'running')
    && (task.categories || task.books || task.notes)) {
    refreshActiveScope()
    void load()
  }
}

async function readWeReadStatus() {
  const epoch = wereadEpoch
  try {
    const value = await request<WeReadStatus>(wereadPath)
    if (epoch === wereadEpoch && !startingWeRead.value) applyWeReadStatus(value)
  } catch (failure) {
    if (epoch === wereadEpoch && !startingWeRead.value && wereadTask.value?.state === 'running') {
      wereadError.value = '暂时无法查看进度，正在重试…'
      wereadTimer = setTimeout(() => void readWeReadStatus(), 5000)
    }
  }
}

async function syncWeRead() {
  if (startingWeRead.value || wereadTask.value?.state === 'running') return
  const epoch = ++wereadEpoch
  const owner = store.account.value
  const token = store.token.value
  startingWeRead.value = true
  wereadError.value = ''
  clearWeReadTimer()
  try {
    await flushPendingUploads()
    if (epoch !== wereadEpoch || owner !== store.account.value || token !== store.token.value) return
    const value = await request<WeReadStatus>(wereadPath, 'POST')
    if (epoch === wereadEpoch) applyWeReadStatus(value)
  } catch (failure) {
    if (epoch === wereadEpoch) wereadError.value = failure instanceof Error ? failure.message : '提交同步失败'
  } finally {
    if (epoch === wereadEpoch) startingWeRead.value = false
  }
}

function stopWeReadPolling() {
  wereadEpoch++
  startingWeRead.value = false
  clearWeReadTimer()
}

let storageRead = 0

/** 从本机重新读取各类节点，忽略晚到的旧读取结果。 */
async function refreshStorage() {
  const owner = store.account.value
  const read = ++storageRead
  const rows = await readOfflineNodes(owner)
  if (read === storageRead && owner === store.account.value) localNodes.value = rows
}

watch([() => downloadProgress.updatedAt, noteSyncRunning], () => {
  if (!clearing.value && !noteSyncRunning.value) void refreshStorage()
})

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
  void refreshStorage()
  void refreshAccountProfile().catch(() => { if (!store.token.value) requireLogin() })
  void load()
  void readWeReadStatus()
})
onHide(stopWeReadPolling)
onUnload(stopWeReadPolling)
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
.weread-status { display: block; margin-top: 8px; }

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
.local-data { margin: 9px 0 12px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
.local-counts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-top: 6px; }
.local-count { display: flex; flex-direction: column; align-items: center; }
.local-value { color: var(--ink-800); font-size: 17px; line-height: 1.4; font-weight: 650; font-variant-numeric: tabular-nums; }
.cache-actions { display: flex; justify-content: flex-end; margin-top: 12px; }
.cache-actions .btn { margin: 0; }

.sync-row { display: flex; align-items: center; gap: 8px; padding-top: 10px; }
.sync-title { display: block; font-size: 13px; color: var(--ink-800); }
</style>
