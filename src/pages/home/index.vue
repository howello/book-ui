<template>
  <view class="app" :class="theme" @touchstart="start" @touchend="end">
    <view class="header">
      <button v-if="current" size="mini" @click="back">返回</button>
      <text>{{ current?.title || tabs[tab] }}</text>
      <button v-if="tab === 0" size="mini" @click="begin()">新增{{ names[nextType] }}</button>
    </view>
    <view v-if="!token" class="form">
      <text>登录现有账号</text>
      <input v-model="username" placeholder="账号" />
      <input v-model="password" password placeholder="密码" />
      <view v-if="captcha.img">
        <image :src="'data:image/gif;base64,' + captcha.img" @click="loadCaptcha" />
        <input v-model="code" placeholder="验证码" />
      </view>
      <view v-if="captcha.turnstileEnabled">
        <!-- #ifdef H5 -->
        <iframe v-if="challengeUrl" ref="challengeFrame" :key="challengeUrl" :src="challengeUrl" title="人机校验" />
        <!-- #endif -->
        <!-- #ifdef APP-PLUS -->
        <button v-if="captcha.turnstileSiteKey" @click="openChallenge">{{ challengeToken ? '已完成人机校验' : '进行人机校验' }}</button>
        <!-- #endif -->
        <text v-if="!captcha.turnstileSiteKey">人机校验尚未配置</text>
      </view>
      <button @click="login">登录</button>
    </view>
    <view v-else-if="draft && tab === 0" class="form">
      <input v-model="draft.title" placeholder="标题" maxlength="200" />
      <template v-if="draft.nodeType === 'book' && draft.metadata">
        <label v-for="field in metadataFields" :key="field.key">
          <text>{{ field.label }}</text>
          <input v-model="draft.metadata[field.key]" :placeholder="field.label" />
        </label>
      </template>
      <textarea v-model="draft.draftText" :placeholder="draft.nodeType === 'book' ? '简介' : '正文'" />
      <template v-if="draft.nodeType === 'category' || draft.nodeType === 'book'">
        <image v-if="cover(draft)" class="preview" :src="cover(draft)" mode="aspectFill" />
        <text v-if="draft.pendingCover">已选图片，保存时上传</text>
        <button size="mini" @click="randomize(draft)">换一张默认封面</button>
        <button size="mini" @click="pickImage(true)">拍照或选择封面</button>
        <input v-model="searchQuery" placeholder="检索关键词" />
        <view v-if="draft.nodeType === 'category' && draft.title.trim()" class="tree-tools">
          <button v-for="term in ['分类 封面', '意境', '静物', '留白']" :key="term" size="mini"
            @click="searchCategory(term)">{{ draft.title.trim() }} {{ term }}</button>
        </view>
        <button size="mini" @click="searchCover">{{ draft.nodeType === 'book' ? '查找书目' : '查找分类配图' }}</button>
        <text v-if="searchStatus">{{ searchStatus }}</text>
        <view v-for="item in candidates" :key="item.title + item.cover" class="search-result">
          <image v-if="item.cover" :src="item.cover" mode="aspectFill" />
          <text>{{ item.title }} {{ item.author }} {{ item.year }}</text>
          <text>{{ item.source }}</text>
          <button v-if="draft.nodeType === 'book'" size="mini" @click="useCandidate(item, true)">用这本</button>
          <button v-if="item.cover" size="mini" @click="useCandidate(item, false)">仅封面</button>
        </view>
      </template>
      <template v-if="draft.nodeType === 'note'">
        <button size="mini" @click="pickImage(false)">拍照或添加图片</button>
        <button size="mini" @click="record">{{ recording ? '停止录音' : '录音' }}</button>
        <view v-for="(item, index) in draft.attachments" :key="index">
          {{ item.kind === 'image' ? '图片' : '语音' }}
          <button size="mini" @click="draft.attachments?.splice(index, 1)">移除</button>
        </view>
      </template>
      <button :disabled="saving" @click="save">保存</button>
      <button :disabled="saving" @click="discardDraft">取消</button>
    </view>
    <template v-else-if="tab === 0">
      <view v-if="path.length" class="breadcrumbs" aria-label="当前位置">
        <button size="mini" @click="goToAncestor(-1)">书架</button>
        <template v-for="(ancestor, index) in path" :key="ancestor.id">
          <text>›</text>
          <button v-if="index < path.length - 1" size="mini" @click="goToAncestor(index)">{{ ancestor.title }}</button>
          <text v-else>{{ ancestor.title }}</text>
        </template>
      </view>
      <view v-if="current" class="detail">
        <view v-if="current.nodeType === 'book'">
          <view v-for="field in metadataFields" :key="field.key">
            <text v-if="metadata(current)[field.key]">{{ field.label }} · {{ metadata(current)[field.key] }}</text>
          </view>
        </view>
        <text>{{ body(current) }}</text>
        <view v-for="item in attachments(current)" :key="item.url || item.id">
          <button size="mini" @click="viewMedia(item)">{{ item.kind === 'image' ? '查看图片' : '播放语音' }}</button>
        </view>
        <button v-if="coverMedia(current)" size="mini"
          @click="viewMedia(coverMedia(current))">查看封面</button>
        <button size="mini" @click="begin(current)">编辑</button>
        <button size="mini" @click="locate(current)">在知识树中定位</button>
      </view>
      <view :class="['entries', shelf ? 'shelf' : 'list']">
        <view v-for="node in nodes" :key="node.id" class="entry" :class="{ selected: shelfFocus === node.id }" @click="open(node)" @longpress.stop="menu(node)">
          <view v-if="shelf" class="cover">
            <image v-if="cover(node)" :src="cover(node)" mode="aspectFill" />
            <text>{{ node.title }}</text>
          </view>
          <text>{{ node.title }}</text>
          <button size="mini" :aria-label="node.title + '的操作'" @click.stop="menu(node)">⋯</button>
        </view>
      </view>
      <text v-if="!nodes.length" class="detail">暂无{{ names[nextType] }}</text>
    </template>
    <view v-else-if="tab === 1" class="tree">
      <view class="tree-tools">
        <button size="mini" @click="canvas = false">目录大纲</button>
        <button size="mini" @click="canvas = true">思维导图</button>
        <template v-if="canvas">
          <button size="mini" @click="zoom(scale - .15)">缩小</button>
          <button size="mini" @click="zoom(scale + .15)">放大</button>
          <button size="mini" @click="fitCanvas">适应屏幕</button>
          <text>{{ Math.round(scale * 100) }}%</text>
        </template>
      </view>
      <view v-if="canvas">
      <scroll-view class="canvas" scroll-x scroll-y :scroll-left="canvasScroll.x" :scroll-top="canvasScroll.y" @scroll="rememberCanvasScroll" @touchstart.stop="startCanvasTouch"
        @touchmove.stop="moveCanvasTouch" @touchend.stop="pinchDistance = 0" @touchcancel.stop="pinchDistance = 0">
        <view class="canvas-layout" :style="{ width: canvasWidth * scale + 'px', height: canvasHeight * scale + 'px' }">
          <view class="canvas-plane" :style="{ transform: 'scale(' + scale + ')' }">
            <view v-for="edge in canvasEdges" :key="edge.id" class="canvas-edge"
              :class="{ 'edge-active': edge.active }"
              :style="{ left: edge.x + 'px', top: edge.y + 'px', width: edge.length + 'px', transform: 'rotate(' + edge.angle + 'rad)' }" />
            <view v-for="item in canvasNodes" :key="item.node.id" class="canvas-node"
              :class="{ selected: focus === item.node.id }"
              :style="{ left: item.x + 'px', top: item.y + 'px' }" @click="focus = item.node.id">
              <text>{{ item.node.title }}</text>
              <button v-if="tree.some(node => node.parentId === item.node.id)" size="mini"
                @click.stop="item.node.visible = !item.node.visible">{{ item.node.visible ? '−' : '+' }}</button>
            </view>
          </view>
        </view>
      </scroll-view>
      </view>
      <view v-else>
      <view v-for="node in treeRows" :key="node.id" :class="{ selected: focus === node.id }"
        :style="{ paddingLeft: Math.min(12, node.depth) * 16 + 'px' }">
        <button size="mini" @click="node.visible = !node.visible">{{ node.visible ? '−' : '+' }}</button>
        <text @click="focus = node.id">{{ node.title }}</text>
        <button size="mini" @click="open(node)">查看</button>
      </view>
      </view>
      <view v-if="selectedNode" class="tree-tools">
        <button size="mini" @click="open(selectedNode)">查看 {{ selectedNode.title }}</button>
        <button size="mini" @click="shelfLocate">在书架中定位</button>
      </view>
    </view>
    <view v-else class="form">
      <text>外观</text>
      <picker :range="themes" @change="changeTheme"><view>{{ themes[themeIndex] }}</view></picker>
      <text>离线数据</text>
      <text>{{ cacheCount }} 个缓存页面</text>
      <text>{{ draft ? '1 条待保存草稿' : '没有待保存草稿' }}</text>
      <text v-if="saveProgress" role="status">{{ saveProgress }}</text>
      <button v-if="draft" :disabled="saving" @click="switchTab(0)">继续编辑草稿</button>
      <button v-if="draft" :disabled="saving" @click="save">提交草稿</button>
      <!-- #ifdef APP-PLUS -->
      <button @click="checkAppUpdateManually().catch(show)">检查更新</button>
      <!-- #endif -->
      <button @click="logout">退出登录</button>
    </view>
    <text v-if="error" role="alert" class="error">{{ error }}</text>
    <view class="tabs" v-if="token">
      <button v-for="(label, index) in tabs" :key="label" :class="{ selected: index === tab }" @click="switchTab(index)">{{ label }}</button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { baseApi, bookStoragePrefix } from '../../api-env'
import { mediaBlob } from '../../media-cache'
import { checkAndUpdateApp, checkAppUpdateManually } from '../../app-update'

type Kind = 'category' | 'book' | 'note' | 'remark'
type Candidate = { title: string; author?: string; year?: string; cover: string; source: string }
const searchQuery = ref('')
const candidates = ref<Candidate[]>([])
const searchStatus = ref('')
let searchSequence = 0
function searchCategory(term: string) {
  if (!draft.value) return
  searchQuery.value = draft.value.title.trim() + ' ' + term
  void searchCover()
}
async function searchCover() {
  const node = draft.value
  if (!node) return
  const query = searchQuery.value.trim() || node.title.trim()
  if (!query) { searchStatus.value = '请输入关键词'; return }
  const sequence = ++searchSequence
  candidates.value = []
  searchStatus.value = '搜索中…'
  try {
    const path = node.nodeType === 'book' ? 'catalog' : 'images'
    const results = await request<Candidate[]>('/book/search/' + path + '?q=' + encodeURIComponent(query))
    if (sequence !== searchSequence || node !== draft.value) return
    candidates.value = results
    searchStatus.value = results.length ? '' : '没有找到结果'
  } catch (failure) {
    if (sequence === searchSequence) searchStatus.value = failure instanceof Error ? failure.message : '检索失败'
  }
}
function useCandidate(item: Candidate, fill: boolean) {
  const node = draft.value
  if (!node) return
  if (fill) {
    if (item.title) node.title = item.title
    const existing = node.metadata || metadata(node)
    node.metadata = { ...existing, author: item.author || existing.author, year: item.year || existing.year }
  }
  if (item.cover) {
    node.coverKind = 'external'
    node.coverRef = item.cover
    node.pendingCover = undefined
  }
}
type Attachment = { blobKey?: string; kind: "image" | "audio"; id?: string; url?: string; path?: string }
const metadataFields = [
  { key: 'author', label: '作者' }, { key: 'translator', label: '译者' },
  { key: 'publisher', label: '出版社' }, { key: 'year', label: '出版年' },
  { key: 'isbn', label: 'ISBN' }, { key: 'pages', label: '页数' },
] as const
type Metadata = Partial<Record<(typeof metadataFields)[number]['key'], string>>
function metadata(node: BookNode): Metadata {
  try { return JSON.parse(node.contentJson || '{}') as Metadata } catch { return {} }
}
type BookNode = { id: string; parentId?: string; nodeType: Kind; title: string; contentJson?: string; version?: number; draftText?: string; metadata?: Metadata; attachments?: Attachment[]; pendingCover?: Attachment; coverKind?: string; coverRef?: string }
type TreeNode = BookNode & { depth: number; visible: boolean }
const names = { category: '分类', book: '书本', note: '感悟', remark: '备注' }
const tabs = ['书架', '知识树', '我的']
const themes = ['跟随系统', '浅色', '深色']
const token = ref<string>(uni.getStorageSync(bookStoragePrefix + '-token') || '')
const account = ref<string>(uni.getStorageSync(bookStoragePrefix + '-account') || '')
const username = ref('')
const password = ref('')
const code = ref('')
const captcha = ref<{ img?: string; uuid?: string; turnstileEnabled?: boolean; turnstileSiteKey?: string }>({})
const challengeToken = ref('')
const challengeRevision = ref(0)
let challengeExpiry = 0
function setChallengeToken(value: string) {
  challengeToken.value = value
  challengeExpiry = value ? Date.now() + 240000 : 0
}
// #ifdef H5
const challengeFrame = ref<HTMLIFrameElement>()
const challengeUrl = computed(() => {
  if (!captcha.value.turnstileSiteKey) return ''
  const url = new URL(import.meta.env.BASE_URL + 'static/turnstile/index.html', location.origin)
  url.searchParams.set('siteKey', captcha.value.turnstileSiteKey)
  url.searchParams.set('revision', String(challengeRevision.value))
  return url.href
})
function receiveChallenge(event: MessageEvent) {
  if (event.origin === location.origin && event.source === challengeFrame.value?.contentWindow
      && event.data?.type === 'book-turnstile' && typeof event.data.token === 'string') {
    setChallengeToken(event.data.token)
  }
}
onMounted(() => window.addEventListener('message', receiveChallenge))
onUnmounted(() => window.removeEventListener('message', receiveChallenge))
// #endif
// #ifdef APP-PLUS
function openChallenge() {
  setChallengeToken('')
  uni.navigateTo({
    url: '/pages/login/challenge?siteKey=' + encodeURIComponent(captcha.value.turnstileSiteKey || ''),
    events: { verified: setChallengeToken },
    fail: () => show(new Error('无法打开人机校验')),
  })
}
// #endif
const tab = ref(0)
const treeReturn = ref('')
const canvasScroll = reactive({ x: 0, y: 0 })
function rememberCanvasScroll(event: { detail: { scrollLeft: number; scrollTop: number } }) {
  canvasScroll.x = event.detail.scrollLeft
  canvasScroll.y = event.detail.scrollTop
}
const nodes = ref<BookNode[]>([])
const path = ref<BookNode[]>([])
const current = computed(() => path.value[path.value.length - 1])
const nextType = computed<Kind>(() => current.value?.nodeType === 'category' ? 'book' : current.value?.nodeType === 'book' ? 'note' : current.value ? 'remark' : 'category')
const shelf = computed(() => ['category', 'book'].includes(nextType.value))
const error = ref('')
const draft = ref<BookNode>()
const draftKey = () => bookStoragePrefix + '-draft:' + account.value
watch(draft, value => {
  if (account.value && value) uni.setStorageSync(draftKey(), value)
}, { deep: true, flush: 'sync' })
function restoreDraft() {
  const value = uni.getStorageSync(draftKey())
  if (value?.id) draft.value = value
}
function discardDraft() {
  uni.removeStorageSync(draftKey())
  draft.value = undefined
}
function newId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const digit = Math.floor(Math.random() * 16)
    return (char === 'x' ? digit : (digit & 3) | 8).toString(16)
  })
}
const focus = ref('')
const tree = ref<TreeNode[]>([])
const canvas = ref(false)
const scale = ref(1)
const shelfFocus = ref('')
const selectedNode = computed(() => tree.value.find(node => node.id === focus.value))
const cacheCount = ref(0)
const saving = ref(false)
const saveProgress = ref('')
const themeIndex = ref<number>(uni.getStorageSync(bookStoragePrefix + '-theme') || 0)
const theme = computed(() => ['system', 'light', 'dark'][themeIndex.value])
const treeRows = computed(() => {
  const rows: TreeNode[] = []
  const visited = new Set<string>()
  const groups = new Map<string, TreeNode[]>()
  for (const node of tree.value) {
    const key = node.parentId || ''
    const children = groups.get(key) || []
    children.push(node)
    groups.set(key, children)
  }
  function append(parent: string, depth: number) {
    for (const node of groups.get(parent) || []) {
      if (visited.has(node.id)) continue
      visited.add(node.id)
      node.depth = depth
      rows.push(node)
      if (node.visible) append(node.id, depth + 1)
    }
  }
  append('', 0)
  return rows
})

const canvasNodes = computed(() => {
  const children = new Map<string, TreeNode[]>()
  for (const node of treeRows.value) {
    const parent = node.parentId || ''
    const group = children.get(parent) || []
    group.push(node)
    children.set(parent, group)
  }
  const positions: { node: TreeNode; x: number; y: number }[] = []
  let nextY = 12
  function place(node: TreeNode): number {
    const descendants = children.get(node.id) || []
    const rows = descendants.map(place)
    const y = rows.length ? (rows[0] + rows[rows.length - 1]) / 2 : nextY
    if (!rows.length) nextY += 66
    positions.push({ node, x: 12 + 176 * node.depth, y })
    return y
  }
  for (const root of children.get('') || []) place(root)
  return positions
})
const canvasEdges = computed(() => {
  const positions = new Map(canvasNodes.value.map(item => [item.node.id, item]))
  const path = new Set<string>()
  let cursor = selectedNode.value
  while (cursor && !path.has(cursor.id)) {
    path.add(cursor.id)
    cursor = cursor.parentId ? positions.get(cursor.parentId)?.node : undefined
  }
  return canvasNodes.value.flatMap(item => {
    const parent = item.node.parentId ? positions.get(item.node.parentId) : undefined
    if (!parent) return []
    const x = parent.x + 152
    const y = parent.y + 21
    return [{
      id: item.node.id, x, y,
      angle: Math.atan2(item.y + 21 - y, item.x - x),
      length: Math.hypot(item.x - x, item.y + 21 - y),
      active: path.has(item.node.id) && path.has(parent.node.id),
    }]
  })
})
const canvasWidth = computed(() => canvasNodes.value.reduce((max, item) => Math.max(max, item.x + 180), 320))
const canvasHeight = computed(() => canvasNodes.value.reduce((max, item) => Math.max(max, item.y + 72), 320))
function zoom(value: number) {
  scale.value = Math.max(.22, Math.min(2.4, value))
}
function fitCanvas() {
  uni.createSelectorQuery().select('.canvas').boundingClientRect(bounds => {
    if (!bounds || Array.isArray(bounds) || !bounds.width || !bounds.height) return
    zoom(Math.min(1.15, bounds.width / canvasWidth.value, bounds.height / canvasHeight.value))
  }).exec()
}
// #ifdef H5
function wheelZoom(event: WheelEvent) {
  if (!(event.target instanceof Element) || !event.target.closest('.canvas') || event.deltaY === 0) return
  event.preventDefault()
  zoom(scale.value * (event.deltaY < 0 ? 1.15 : 1 / 1.15))
}
onMounted(() => document.addEventListener('wheel', wheelZoom, { capture: true, passive: false }))
onUnmounted(() => document.removeEventListener('wheel', wheelZoom, true))
// #endif
let pinchDistance = 0
let pinchScale = 1
function distance(event: TouchEvent) {
  const [first, second] = Array.from(event.touches)
  return first && second ? Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY) : 0
}
function startCanvasTouch(event: TouchEvent) {
  pinchDistance = distance(event)
  pinchScale = scale.value
}
function moveCanvasTouch(event: TouchEvent) {
  const currentDistance = distance(event)
  if (pinchDistance && currentDistance) {
    if (event.cancelable) event.preventDefault()
    zoom(pinchScale * currentDistance / pinchDistance)
  }
}
function shelfLocate() {
  let node = selectedNode.value
  while (node && node.nodeType !== 'book' && node.nodeType !== 'category') {
    const parentId = node.parentId
    node = tree.value.find(item => item.id === parentId)
  }
  if (!node) return
  treeReturn.value = ''
  shelfFocus.value = node.id
  const category = tree.value.find(item => item.id === node?.parentId)
  path.value = category ? [category] : []
  switchTab(0)
}

const coverAssets = import.meta.glob<string>('/src/static/covers/*/*', { eager: true, query: '?url', import: 'default' })
function coverMedia(node: BookNode): Attachment | undefined {
  if (!node.coverRef) return
  if (node.coverKind === 'public') return { kind: 'image', url: node.coverRef }
  if (node.coverKind === 'private') return { kind: 'image', id: node.coverRef }
}
function publicMediaUrl(url?: string) {
  if (!url) return
  if (/^https?:\/\//i.test(url)) return url
  if (url.startsWith('/profile/')) return api + url
}
function cover(node: BookNode) {
  const media = coverMedia(node)
  if (media) return localMedia.get(account.value + ':saved:' + (media.url || media.id)) || publicMediaUrl(media.url)
  if (node.coverKind === 'external' && /^https:\/\/(?:upload.wikimedia.org|covers.openlibrary.org)\//.test(node.coverRef || '')) return node.coverRef
  return node.coverKind === 'local' && node.coverRef ? coverAssets['/src/static/covers/' + node.coverRef] : ''
}
function randomize(node: BookNode) {
  const prefix = '/src/static/covers/' + node.nodeType + '/'
  const files = Object.keys(coverAssets).filter(key => key.startsWith(prefix) && /[.](svg|jpg|jpeg|png|webp)$/i.test(key))
  if (!files.length) return
  const alternatives = files.filter(key => key !== '/src/static/covers/' + node.coverRef)
  const pool = alternatives.length ? alternatives : files
  node.pendingCover = undefined
  node.coverKind = 'local'
  node.coverRef = pool[Math.floor(Math.random() * pool.length)].slice('/src/static/covers/'.length)
}
const api = baseApi()
function request<T>(url: string, method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', data?: object) {
  if (!api) return Promise.reject(new Error('请配置 App 后端地址'))
  const requestToken = token.value
  return new Promise<T>((resolve, reject) => uni.request({
    url: api + url, method, data, header: requestToken ? { Authorization: 'Bearer ' + requestToken } : {},
    success(response) {
      const result = response.data as { code?: number; msg?: string; data?: T }
      const status = result?.code || response.statusCode
      if (status === 401 && requestToken && requestToken === token.value) clearSession()
      if (status !== 200) return reject(Object.assign(new Error(result?.msg || '请求失败'), { status }))
      resolve((result.data ?? result) as T)
    },
    fail() { reject(new Error('网络不可用')) },
  }))
}
function clearSession() {
  treeReturn.value = ''
  canvasScroll.x = 0
  canvasScroll.y = 0
  saveProgress.value = ''
  player?.destroy()
  // #ifdef H5
  for (const path of localMedia.values()) URL.revokeObjectURL(path)
  // #endif
  localMedia.clear()
  token.value = ''
  account.value = ''
  nodes.value = []
  path.value = []
  tree.value = []
  draft.value = undefined
  tab.value = 0
  uni.removeStorageSync(bookStoragePrefix + '-token')
  uni.removeStorageSync(bookStoragePrefix + '-account')
  void loadCaptcha()
}
function updateCount() {
  cacheCount.value = uni.getStorageInfoSync().keys.filter(key => key.startsWith(bookStoragePrefix + '-cache:' + account.value + ':')).length
}
async function cached<T>(url: string) {
  const owner = account.value
  const key = bookStoragePrefix + '-cache:' + owner + ':' + url
  try {
    const value = await request<T>(url)
    if (owner !== account.value) throw new Error('账号会话已变化')
    try { uni.setStorageSync(key, value); updateCount() } catch { /* 缓存空间不足时仍显示在线数据 */ }
    return value
  } catch (failure) {
    if (owner !== account.value) throw failure
    if (failure instanceof Error && 'status' in failure && failure.status === 404) {
      uni.removeStorageSync(key)
      const nodeId = /^\/book\/nodes\/([^/?]+)$/.exec(url)?.[1]
      if (nodeId) pruneDeletedCache(account.value, new Set([nodeId]))
    }
    if (token.value && failure instanceof Error && failure.message === '网络不可用') {
      const value = uni.getStorageSync(key)
      if (value !== '' && value != null) return value as T
      throw new Error('联网打开后可离线使用')
    }
    throw failure
  }
}
async function loadCaptcha() {
  setChallengeToken('')
  challengeRevision.value++
  try { captcha.value = await request('/captchaImage') } catch (failure) { show(failure) }
}
function show(failure: unknown) { error.value = failure instanceof Error ? failure.message : '操作失败' }
async function login() {
  try {
    error.value = ''
    if (captcha.value.turnstileEnabled && (!challengeToken.value || challengeExpiry <= Date.now())) {
      error.value = '请先完成人机校验'
      return
    }
    const loginResult = await request<{ token: string }>('/login', 'POST', { username: username.value, password: password.value, uuid: captcha.value.uuid, code: code.value, turnstileToken: challengeToken.value || undefined })
    token.value = loginResult.token
    const result = await request<{ user: { userId: number } }>('/getInfo')
    account.value = String(result.user.userId)
    uni.setStorageSync(bookStoragePrefix + '-token', token.value)
    uni.setStorageSync(bookStoragePrefix + '-account', account.value)
    password.value = ''
    restoreDraft()
    await load()
  } catch (failure) {
    clearSession()
    show(failure)
  }
}
async function logout() {
  try { await request('/logout', 'POST') } catch { /* 本机退出即清除会话 */ }
  clearSession()
}
async function load() {
  error.value = ''
  if (!token.value) return
  try {
    if (tab.value === 0) {
      nodes.value = []
      nodes.value = await cached<BookNode[]>('/book/nodes' + (current.value ? '?parentId=' + current.value.id : ''))
    }
    if (tab.value === 1) {
      const expanded = new Set(tree.value.filter(node => node.visible).map(node => node.id))
      tree.value = (await cached<BookNode[]>('/book/nodes?tree=true')).map(node => ({ ...node, depth: 0, visible: !node.parentId || expanded.has(node.id) }))
      let node = tree.value.find(item => item.id === focus.value)
      while (node?.parentId) {
        node = tree.value.find(item => item.id === node?.parentId)
        if (node) node.visible = true
      }
    }
    const shown = current.value ? [current.value, ...nodes.value] : nodes.value
    if (tab.value === 0) {
      const media = shown.map(coverMedia).filter((item): item is Attachment => item !== undefined)
      void Promise.allSettled(media.map(resolveMedia))
    }
    updateCount()
  } catch (failure) { show(failure) }
}
async function open(node: BookNode) {
  try {
    const detail = await cached<BookNode>('/book/nodes/' + node.id)
    if (tab.value === 1) {
      treeReturn.value = detail.id
      focus.value = detail.id
      const ancestors: BookNode[] = []
      let parent = tree.value.find(item => item.id === detail.parentId)
      while (parent) {
        ancestors.unshift(parent)
        parent = tree.value.find(item => item.id === parent?.parentId)
      }
      path.value = ancestors
    }
    path.value.push(detail)
    tab.value = 0
    await load()
  } catch (failure) { show(failure) }
}
function goToAncestor(index: number) {
  treeReturn.value = ''
  path.value = path.value.slice(0, index + 1)
  void load()
}
function back() {
  if (current.value && current.value.id === treeReturn.value && !draft.value) {
    treeReturn.value = ''
    switchTab(1)
  } else if (treeReturn.value && path.value.length > 1) {
    path.value.pop()
    void load()
  } else {
    goToAncestor(path.value.length - 2)
  }
}
function locate(node: BookNode) { focus.value = node.id; switchTab(1) }
function switchTab(index: number) {
  if (index < 0 || index >= tabs.length) return
  tab.value = index
  void load()
}
function body(node: BookNode) {
  try { return (JSON.parse(node.contentJson || '{}') as { text?: string }).text || '' } catch { return '' }
}
function attachments(node: BookNode): Attachment[] {
  try { return JSON.parse(node.contentJson || '{}').attachments || [] } catch { return [] }
}
const recording = ref(false)
let recorder: UniApp.RecorderManager | undefined
const localMedia = reactive(new Map<string, string>())
let player: UniApp.InnerAudioContext | undefined
function keepFile(path: string, kind: Attachment['kind'], isCover: boolean) {
  const input = draft.value
  if (!input) return
  const apply = (item: Attachment) => {
    if (draft.value !== input) return
    if (isCover) input.pendingCover = item
    else (input.attachments ??= []).push(item)
  }
  // #ifdef APP-PLUS
  uni.saveFile({ tempFilePath: path, success: result => apply({ kind, path: result.savedFilePath }), fail: error => show(new Error(error.errMsg)) })
  // #endif
  // #ifdef H5
  const blobKey = account.value + ':draft:' + newId()
  void fetch(path).then(response => response.blob()).then(blob => mediaBlob(blobKey, blob))
    .then(() => apply({ kind, blobKey })).catch(show)
  // #endif
}
function pickImage(isCover: boolean) {
  uni.chooseImage({
    count: 1,
    sourceType: ['album', 'camera'],
    success: result => {
      const paths = typeof result.tempFilePaths === 'string' ? [result.tempFilePaths] : result.tempFilePaths
      if (paths[0]) keepFile(paths[0], 'image', isCover)
    },
    fail: failure => {
      if (!failure.errMsg.includes('cancel')) show(new Error('无法选择图片，请检查相机或相册访问权限'))
    },
  })
}
let browserRecorder: MediaRecorder | undefined
async function record() {
  try {
    // #ifdef H5
    if (browserRecorder?.state === 'recording') { browserRecorder.stop(); return }
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('录音需要 HTTPS 与麦克风权限')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const chunks: BlobPart[] = []
    browserRecorder = new MediaRecorder(stream)
    browserRecorder.ondataavailable = event => chunks.push(event.data)
    browserRecorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop())
      keepFile(URL.createObjectURL(new Blob(chunks, { type: browserRecorder?.mimeType })), 'audio', false)
      recording.value = false
    }
    browserRecorder.start()
    // #endif
    // #ifdef APP-PLUS
    if (!recorder) {
      recorder = uni.getRecorderManager()
      recorder.onStop(result => { recording.value = false; keepFile(result.tempFilePath, 'audio', false) })
      recorder.onError(error => { recording.value = false; show(new Error(error.errMsg)) })
    }
    if (recording.value) { recorder.stop(); return }
    recorder.start({ format: 'aac' })
    // #endif
    recording.value = true
  } catch (failure) { show(failure) }
}
// #ifdef H5
const mediaExtensions: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/bmp': 'bmp',
  'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/aac': 'aac', 'audio/mp4': 'm4a',
  'audio/ogg': 'ogg', 'audio/webm': 'webm',
}
// #endif
async function upload(item: Attachment): Promise<string> {
  const source: Pick<UniApp.UploadFileOption, 'files' | 'filePath'> = {}
  // #ifdef H5
  const blob = item.blobKey && await mediaBlob(item.blobKey)
  if (!blob) throw new Error('草稿附件已不可用，请重新选择')
  const extension = mediaExtensions[blob.type.split(';', 1)[0].trim().toLowerCase()]
  if (!extension) throw new Error('不支持该图片或音频格式')
  source.files = [{ name: 'file', file: new File([blob], 'attachment.' + extension, { type: blob.type }) }]
  // #endif
  // #ifdef APP-PLUS
  if (!item.path) throw new Error('附件文件不可用')
  source.filePath = item.path
  // #endif
  return new Promise<string>((resolve, reject) => uni.uploadFile({
    ...source, url: api + '/common/upload', name: 'file', header: { Authorization: 'Bearer ' + token.value },
    success: response => {
      try {
        const body = JSON.parse(response.data)
        if (response.statusCode === 200 && body.code === 200 && body.url) resolve(body.url)
        else reject(new Error(body.msg || '附件上传失败'))
      } catch { reject(new Error('附件上传失败')) }
    },
    fail: () => reject(new Error('附件上传失败，草稿已保留')),
  }))
}
async function resolveMedia(item: Attachment) {
  const url = publicMediaUrl(item.url)
  if (!url && !item.id) return
  const owner = account.value
  const key = owner + ':saved:' + (item.url || item.id)
  let path = localMedia.get(key)
  // #ifdef H5
  if (!path) {
    let blob = await mediaBlob(key).catch(() => undefined)
    if (!blob) {
      if (!url) throw new Error('此历史附件需重新上传')
      const response = await fetch(url)
      if (!response.ok || !/^(image|audio)\//.test(response.headers.get('Content-Type') || '')) throw new Error('附件读取失败')
      blob = await response.blob()
      if (account.value !== owner) return
      await mediaBlob(key, blob).catch(() => undefined)
    }
    path = URL.createObjectURL(blob)
  }
  // #endif
  // #ifdef APP-PLUS
  path ||= uni.getStorageSync(bookStoragePrefix + '-media:' + key)
  if (!path) {
    if (!url) throw new Error('此历史附件需重新上传')
    path = await new Promise<string>((resolve, reject) => uni.downloadFile({
      url,
      success: result => result.statusCode === 200 ? resolve(result.tempFilePath) : reject(new Error('附件读取失败')),
      fail: () => reject(new Error('联网加载后才能查看附件')),
    }))
    path = await new Promise<string>(resolve => uni.saveFile({
      tempFilePath: path!, success: result => {
        uni.setStorageSync(bookStoragePrefix + '-media:' + key, result.savedFilePath)
        resolve(result.savedFilePath)
      }, fail: () => resolve(path!),
    }))
  }
  // #endif
  if (account.value !== owner || !path) return
  localMedia.set(key, path)
  return path
}
async function viewMedia(item?: Attachment) {
  if (!item) return
  try {
    const owner = account.value
    const path = await resolveMedia(item).catch(failure => {
      const url = publicMediaUrl(item.url)
      if (url) return url
      throw failure
    })
    if (!path || owner !== account.value) return
    if (item.kind === 'image') uni.previewImage({ urls: [path] })
    else { player?.destroy(); player = uni.createInnerAudioContext(); player.src = path; player.play() }
  } catch (failure) { show(failure) }
}
function begin(node?: BookNode) {
  searchSequence++
  candidates.value = []
  searchStatus.value = ''
  searchQuery.value = node?.title || ''
  draft.value = { ...(node || { id: newId(), title: '', parentId: current.value?.id, nodeType: nextType.value }), draftText: node ? body(node) : '', metadata: node ? metadata(node) : {}, attachments: node ? attachments(node) : [] }
  if (!node) randomize(draft.value)
}
async function save() {
  const input = draft.value
  if (!input || saving.value) return
  saving.value = true
  error.value = ''
  const owner = account.value
  const total = Number(Boolean(input.pendingCover || input.coverKind === 'external'))
    + (input.attachments || []).filter(item => !item.id && !item.url).length
  let sent = 0
  const reportUpload = () => {
    saveProgress.value = '上传附件 ' + sent + ' / ' + total
  }
  const checkSession = () => {
    if (owner !== account.value || draft.value !== input) throw new Error('账号会话已变化')
  }
  try {
    if (total) reportUpload()
    if (input.pendingCover) {
      const url = await upload(input.pendingCover)
      checkSession()
      input.coverKind = 'public'
      input.coverRef = url
      input.pendingCover = undefined
      sent++
      reportUpload()
    }
    for (const [index, item] of (input.attachments || []).entries()) {
      if (item.id || item.url) continue
      const url = await upload(item)
      checkSession()
      input.attachments![index] = { kind: item.kind, url }
      sent++
      reportUpload()
    }
    if (input.coverKind === 'external' && input.coverRef) {
      const result = await request<{ url: string }>('/book/media/import-cover', 'POST', { url: input.coverRef })
      checkSession()
      input.coverKind = 'public'
      input.coverRef = result.url
      sent++
      reportUpload()
    }
    const { draftText, attachments: media, pendingCover, metadata: bookFields, ...node } = input
    const content = JSON.parse(node.contentJson || '{}') as Record<string, unknown>
    if (node.nodeType === 'book' && bookFields) {
      for (const { key } of metadataFields) content[key] = bookFields[key] || ''
    }
    content.text = draftText || ''
    if (node.nodeType === 'note') content.attachments = media || []
    checkSession()
    saveProgress.value = '正在提交节点…'
    const saved = await request<BookNode>('/book/nodes' + (input.version ? '/' + input.id : ''), input.version ? 'PUT' : 'POST', { ...node, contentJson: JSON.stringify(content) })
    checkSession()
    refreshSavedCache(saved)
    path.value = path.value.map(item => item.id === saved.id ? saved : item)
    discardDraft()
    saveProgress.value = '已保存'
    await load()
  } catch (failure) {
    if (owner === account.value) {
      saveProgress.value = '保存失败，草稿可重试'
      show(failure)
    }
  } finally {
    saving.value = false
  }
}
function refreshSavedCache(saved: BookNode, previousParent?: string) {
  const prefix = bookStoragePrefix + '-cache:' + account.value + ':/book/nodes'
  const detailKey = prefix + '/' + saved.id
  const listKey = saved.parentId ? prefix + '?parentId=' + saved.parentId : prefix
  try {
    if (uni.getStorageSync(detailKey)) uni.setStorageSync(detailKey, saved)
    if (previousParent && previousParent !== saved.parentId) {
      const oldList = prefix + '?parentId=' + previousParent
      const rows = uni.getStorageSync(oldList)
      if (Array.isArray(rows)) uni.setStorageSync(oldList, rows.filter(item => item.id !== saved.id))
    }
    const { contentJson, ...summary } = saved
    for (const key of [listKey, prefix + '?tree=true']) {
      const previous = uni.getStorageSync(key)
      if (!Array.isArray(previous)) continue
      const updated = previous.filter(item => item.id !== saved.id)
      updated.push(summary)
      updated.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.id.localeCompare(b.id))
      uni.setStorageSync(key, updated)
    }
  } catch {
    // 服务端已保存成功，缓存写入异常不影响草稿提交结果。
  }
}
async function moveBook(node: BookNode) {
  try {
    const categories = (await request<BookNode[]>('/book/nodes')).filter(item => item.id !== node.parentId)
    if (!categories.length) throw new Error('没有其他分类可供移动')
    const selected = await new Promise<number | undefined>(resolve => uni.showActionSheet({
      itemList: categories.map(item => item.title),
      success: result => resolve(result.tapIndex),
      fail: () => resolve(undefined),
    }))
    if (selected === undefined || !categories[selected]) return
    const detail = await request<BookNode>('/book/nodes/' + node.id)
    const destination = categories[selected]
    const saved = await request<BookNode>('/book/nodes/' + node.id, 'PUT', { ...detail, parentId: destination.id })
    refreshSavedCache(saved, detail.parentId)
    treeReturn.value = ''
  shelfFocus.value = node.id
    path.value = [destination]
    await load()
  } catch (failure) { show(failure) }
}
function pruneDeletedCache(owner: string, deleted: Set<string>) {
  const prefix = bookStoragePrefix + '-cache:' + owner + ':/book/nodes'
  for (const key of uni.getStorageInfoSync().keys) {
    if (key.startsWith(prefix + '/') && deleted.has(key.slice(prefix.length + 1))) {
      uni.removeStorageSync(key)
    } else if (key === prefix || key.startsWith(prefix + '?')) {
      const parent = key.startsWith(prefix + '?parentId=') ? key.slice((prefix + '?parentId=').length) : ''
      if (deleted.has(parent)) {
        uni.removeStorageSync(key)
        continue
      }
      const rows = uni.getStorageSync(key)
      if (Array.isArray(rows)) uni.setStorageSync(key, rows.filter(row => !deleted.has(row.id)))
    }
  }
}
function menu(node: BookNode) {
  const actions = node.nodeType === 'book' ? ['编辑', '移动分类', '删除'] : ['编辑', '删除']
  uni.showActionSheet({ itemList: actions, success({ tapIndex }) {
    if (tapIndex === 0) {
      void cached<BookNode>('/book/nodes/' + node.id).then(begin).catch(show)
    }
    else if (actions[tapIndex] === '移动分类') void moveBook(node)
    else uni.showModal({ title: '删除节点', content: '将同时删除其下所有节点。', success: async ({ confirm }) => {
      if (!confirm) return
      try {
        const owner = account.value
        const ids = await request<string[]>('/book/nodes/' + node.id, 'DELETE')
        if (owner !== account.value) return
        const deleted = new Set(Array.isArray(ids) ? ids : [node.id])
        pruneDeletedCache(owner, deleted)
        const index = path.value.findIndex(item => deleted.has(item.id))
        if (index >= 0) path.value = path.value.slice(0, index)
        await load()
      } catch (failure) { show(failure) }
    } })
  } })
}
function changeTheme(event: { detail: { value: string | number } }) {
  themeIndex.value = Number(event.detail.value)
  uni.setStorageSync(bookStoragePrefix + '-theme', themeIndex.value)
}
let touchX = 0
let touchY = 0
function start(event: TouchEvent) { touchX = event.changedTouches[0]?.clientX || 0; touchY = event.changedTouches[0]?.clientY || 0 }
function end(event: TouchEvent) {
  if (current.value && tab.value === 0) return
  const touch = event.changedTouches[0]
  if (!touch) return
  const dx = touch.clientX - touchX
  const dy = touch.clientY - touchY
  if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.5) switchTab(tab.value + (dx < 0 ? 1 : -1))
}
onMounted(() => { void checkAndUpdateApp(); if (token.value) { restoreDraft(); void load() } else void loadCaptcha() })
</script>

<style>
.app { min-height: 100vh; padding-bottom: calc(65px + env(safe-area-inset-bottom)); background: #f6f1e7; color: #30261e; box-sizing: border-box }
.app.dark { background: #211c18; color: #f6f1e7 }
@media (prefers-color-scheme: dark) { .app.system { background: #211c18; color: #f6f1e7 } }
.header, .tabs { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px }
.header { font-weight: bold; font-size: 20px }
.tabs { position: fixed; left: 0; right: 0; bottom: 0; padding-bottom: calc(8px + env(safe-area-inset-bottom)); background: #ede2d2; z-index: 2 }
.tabs button { margin: 0; flex: 1; font-size: 14px }
.selected { color: #9e542d; font-weight: bold }
.breadcrumbs { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; margin: 8px 16px }
.breadcrumbs button { margin: 0 }
.entries, .detail, .form, .tree, .error { margin: 16px }
.entries { display: grid; gap: 12px }
.shelf { grid-template-columns: repeat(2,minmax(0,1fr)) }
@media (min-width: 760px) { .shelf { grid-template-columns: repeat(4,minmax(0,1fr)) } }
.entry, .form input, .form textarea { padding: 8px; border-bottom: 1px solid #bdac97 }
.cover { aspect-ratio: 2 / 3; display: flex; align-items: center; justify-content: center; background: #794f39; color: #fff5df; padding: 8px; box-shadow: 0 6px 0 #bb8b61 }
.form { display: grid; gap: 12px }
.form iframe { border: 0; width: 100%; height: 90px }
.form image { width: 140px; height: 52px }
.search-result { display: grid; gap: 4px; padding: 8px; border-bottom: 1px solid #bdac97 }
.form .search-result image { width: 64px; height: 96px }
.form .preview { width: 100px; height: 150px }
.cover { position: relative; overflow: hidden }
.cover image { position: absolute; inset: 0; width: 100%; height: 100% }
.cover text { z-index: 1; background: #38271ea0; padding: 4px 8px }
.error { color: #b44f3d }
.tree-tools { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px }
.canvas { width: 100%; height: 55vh; background: #92745218; border: 1px solid #92745248 }
.canvas-layout, .canvas-plane { position: relative }
.canvas-plane { transform-origin: left top }
.canvas-edge { position: absolute; height: 2px; background: #ac8e72; transform-origin: left center; pointer-events: none }
.canvas-edge.edge-active { height: 3px; background: #9e542d }
.canvas-node { position: absolute; width: 152px; min-height: 42px; display: flex; justify-content: space-between; align-items: center; background: #efe0c8; color: #39281d; padding: 4px; border-radius: 6px; box-sizing: border-box }
.canvas-node.selected, .entry.selected { outline: 2px solid #9e542d }
</style>
