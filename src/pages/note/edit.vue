<template>
  <AppPage :loading="loading" :title="editing ? '编辑感悟' : '写感悟'" :subtitle="book ? `《${book.title}》` : ''" back back-text="取消">
    <template #action>
      <button class="act act-text" :disabled="saving" :aria-busy="saving" @click="submit">
        <text v-if="saving" class="btn-spinner" />
        <text>{{ saveLabel }}</text>
      </button>
    </template>

    <scroll-view class="scroll" scroll-y>
      <view class="editor-top">
        <input v-model="form.title" class="title-input" placeholder="给这条感悟起个标题" maxlength="200" />
        <view class="editor-meta">
          <button class="chip-btn" :class="{ set: !!form.chapter }" @click="editChapter">
            <AppIcon name="book" :size="12" />{{ form.chapter || '章节' }}
          </button>
          <button class="chip-btn" @click="chooseChapter"><AppIcon name="plus" :size="12" />选章节</button>
          <button class="chip-btn" @click="addTag"><AppIcon name="tag" :size="12" />标签</button>
          <button v-for="(tag, index) in form.tags" :key="tag" class="chip-btn" @click="form.tags.splice(index, 1)">{{ tag }} ×</button>
        </view>
      </view>

      <view class="editor-body">
        <view v-for="(block, index) in form.blocks" :key="block.id" class="ed-block">
          <view class="drag"><AppIcon name="more" :size="12" /></view>

          <!-- 文字块 -->
          <textarea
            v-if="block.type === 'text'"
            v-model="block.text"
            class="ed-textarea"
            auto-height
            :placeholder="index === form.blocks.length - 1 ? '继续写…' : '新的一段…'"
          />

          <!-- 引用块 -->
          <view v-else-if="block.type === 'quote'" class="quote-edit">
            <textarea v-model="block.text" class="ed-textarea quote-textarea" auto-height placeholder="在此输入书中原文…" />
            <view class="quote-foot">
              <input v-model="block.page" class="page-input" type="number" placeholder="页码（可选）" />
              <button class="icon-btn" aria-label="删除引用" @click="removeBlock(index)">
                <AppIcon name="close" :size="12" />
              </button>
            </view>
          </view>

          <!-- 图片块 -->
          <view v-else-if="block.type === 'image'" class="ed-img-block">
            <view class="ed-imgbox">
              <AppImage v-if="blockSrc(block)" class="ed-image" :src="blockSrc(block)" mode="widthFix" ratio="4 / 3" />
              <view v-else class="photo-ph ed-photo" @click="pickImage(block)">
                <text class="cap">点击选择图片</text>
              </view>
              <button class="rm" aria-label="移除图片块" @click="removeBlock(index)">
                <AppIcon name="close" :size="13" />
              </button>
            </view>
            <!-- 说明独立在图片下方，避免被圆角容器裁掉 -->
            <view class="cap-row">
              <AppIcon name="text" :size="12" />
              <input v-model="block.caption" class="cap-input" placeholder="写一句图片说明（可选）" />
            </view>
          </view>

          <!-- 语音块 -->
          <view v-else-if="block.type === 'audio'" class="audio-block">
            <button class="audio-play" aria-label="播放" @click="togglePlay(block)">
              <AppIcon name="play" :size="14" />
            </button>
            <view class="audio-wave">
              <view v-for="(height, i) in waveHeights(block.id)" :key="i" class="bar" :style="{ height: height + 'px' }" />
            </view>
            <text class="audio-dur">{{ block.duration ? formatDuration(block.duration) : '—' }}</text>
            <button class="icon-btn" aria-label="删除语音" @click="removeBlock(index)">
              <AppIcon name="trash" :size="12" />
            </button>
          </view>
        </view>

        <!-- 录音中 -->
        <view v-if="recording" class="rec">
          <view class="dotlive" />
          <text class="rec-time">录音中 {{ formatDuration(recordSeconds) }}</text>
          <view class="rec-wave">
            <view v-for="i in 18" :key="i" class="rec-bar" :style="{ height: recBarHeight(i) + 'px' }" />
          </view>
          <button class="rec-stop" @click="stopRecording">结束</button>
        </view>
      </view>

      <view class="insert-bar">
        <button class="tool" @click="insert('text')"><AppIcon name="text" :size="14" />文字</button>
        <button class="tool" @click="insert('image')"><AppIcon name="image" :size="14" />图片</button>
        <button class="tool" @click="insert('audio')"><AppIcon name="mic" :size="14" />语音</button>
        <button class="tool" @click="insert('quote')"><AppIcon name="quote" :size="14" />书中引用</button>
      </view>

      <text class="tiny editor-hint">
        正文是可排序的块序列：文字、图片、语音、引用各自独立，删除只影响单块。
        保存时整篇存为一份块数组，不用把图文音拆成三张表。
      </text>
    </scroll-view>
    <AppToast />
</AppPage>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import AppToast from '../../components/AppToast.vue'
import AppIcon from '../../components/AppIcon.vue'
import AppImage from '../../components/AppImage.vue'
import { baseApi } from '../../api-env'
import { ROUTES } from '../../shared/navigation'
import { fetchNode, fetchNodes, useBookStore } from '../../shared/store'
import type { BookNode, NoteBlock } from '../../shared/types'
import { blocksOf, parseContent, stringifyContent } from '../../shared/types'
import { pageOption, requireLogin, saveNode } from '../../shared/use-book'
import { formatDuration, newLocalKey, saveLocalBlob } from '../../shared/media'
import { toast } from '../../shared/toast'
import { clearDraft, draftId, readDraft, writeDraft } from '../../shared/draft'

const store = useBookStore()
const noteId = ref('')
const parentId = ref('')
const bookId = ref('')
const tree = ref<BookNode[]>([])
const saving = ref(false)
/** 保存阶段文案：上传附件时显示进度，避免用户以为卡住 */
const saveLabel = ref('保存')
const uploadTotal = ref(0)
const uploadDone = ref(0)
const editing = ref(false)

const form = reactive({
  title: '',
  chapter: '',
  tags: [] as string[],
  blocks: [] as NoteBlock[]
})

/** 当前编辑对象的草稿键：新建按类型区分，编辑按节点 ID。 */
const currentDraftId = () => draftId(editing.value ? noteId.value : undefined, 'note')
let draftTimer: ReturnType<typeof setTimeout> | undefined
let draftReady = false

/** 表单变化时防抖落本机草稿，断网或误退也能找回。 */
watch(form, () => {
  if (!draftReady || !store.account.value) return
  clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    writeDraft(store.account.value, currentDraftId(), {
      title: form.title,
      chapter: form.chapter,
      tags: form.tags,
      blocks: form.blocks,
      parentId: parentId.value,
      nodeType: 'note',
      savedAt: Date.now()
    })
  }, 400)
}, { deep: true })

const book = computed(() => tree.value.find(node => node.id === bookId.value))
let player: UniApp.InnerAudioContext | undefined
let localObjectUrl: string | undefined

function newBlockId() {
  return 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function makeBlock(type: NoteBlock['type']): NoteBlock {
  return { id: newBlockId(), type }
}

function insert(type: NoteBlock['type']) {
  if (type === 'audio') {
    void startRecording()
    return
  }
  if (type === 'image') {
    const block = makeBlock('image')
    form.blocks.push(block)
    pickImage(block)
    return
  }
  form.blocks.push(makeBlock(type))
  if (type === 'text' && form.blocks.length === 1) form.blocks[0].text = ''
}

function removeBlock(index: number) {
  form.blocks.splice(index, 1)
}

function editChapter() {
  uni.showModal({
    title: '章节',
    editable: true,
    placeholderText: '如：第五章 · 有庆之死',
    content: form.chapter,
    success: result => {
      if (result.confirm) form.chapter = result.content?.trim() || ''
    }
  })
}

function chooseChapter() {
  uni.showActionSheet({
    itemList: ['第五章 · 有庆之死', '第十章', '序言', '第一章', '自定义…'],
    success: result => {
      if (result.tapIndex === 4) editChapter()
      else form.chapter = ['第五章 · 有庆之死', '第十章', '序言', '第一章'][result.tapIndex] || ''
    }
  })
}

function addTag() {
  uni.showModal({
    title: '标签',
    editable: true,
    placeholderText: '如：小说、生命',
    success: result => {
      const tag = result.content?.trim()
      if (result.confirm && tag && !form.tags.includes(tag)) form.tags.push(tag)
    }
  })
}

/** 图片块展示地址。 */
function blockSrc(block: NoteBlock) {
  return block.url || block.localKey || ''
}

/** 选一张图：H5 立即写入 IndexedDB 并生成预览地址，保存时上传。 */
function pickImage(block: NoteBlock) {
  uni.chooseImage({
    count: 1,
    sourceType: ['album', 'camera'],
    success: async result => {
      const path = Array.isArray(result.tempFilePaths) ? result.tempFilePaths[0] : result.tempFilePaths
      if (!path) return
      // #ifdef H5
      const key = newLocalKey(store.account.value)
      try {
        const response = await fetch(path)
        const blob = await response.blob()
        localObjectUrl = await saveLocalBlob(key, blob)
        block.localKey = localObjectUrl
        block.url = ''
      } catch {
        toast('图片读取失败')
      }
      // #endif
      // #ifdef APP-PLUS
      block.localKey = path
      // #endif
    },
    fail: failure => {
      if (!failure.errMsg.includes('cancel')) toast('无法选择图片，请检查权限')
    }
  })
}

/* ---------- 录音 ---------- */
const recording = ref(false)
const recordSeconds = ref(0)
let recordTimer: ReturnType<typeof setInterval> | undefined
let browserRecorder: MediaRecorder | undefined
let appRecorder: UniApp.RecorderManager | undefined
let pendingAudio: NoteBlock | undefined

function recBarHeight(index: number) {
  return 5 + Math.round(Math.abs(Math.sin(index * 1.7 + recordSeconds.value / 3)) * 16)
}

async function startRecording() {
  // #ifdef H5
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('录音需要 HTTPS 与麦克风权限')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const chunks: BlobPart[] = []
    browserRecorder = new MediaRecorder(stream)
    browserRecorder.ondataavailable = event => chunks.push(event.data)
    browserRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop())
      const block = makeBlock('audio')
      const key = newLocalKey(store.account.value)
      try {
        const blob = new Blob(chunks, { type: browserRecorder?.mimeType || 'audio/webm' })
        block.localKey = await saveLocalBlob(key, blob)
        block.duration = recordSeconds.value
        form.blocks.push(block)
        toast('语音已插入，可稍后补充转写文字')
      } catch {
        toast('语音保存失败')
      }
    }
    browserRecorder.start()
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '无法开始录音')
    return
  }
  // #endif
  // #ifdef APP-PLUS
  if (!appRecorder) {
    appRecorder = uni.getRecorderManager()
    appRecorder.onStop(result => {
      const block = makeBlock('audio')
      block.localKey = result.tempFilePath
      block.duration = recordSeconds.value
      form.blocks.push(block)
      toast('语音已插入')
    })
    appRecorder.onError(() => toast('录音失败'))
  }
  appRecorder.start({ format: 'aac' })
  // #endif
  recording.value = true
  recordSeconds.value = 0
  clearInterval(recordTimer)
  recordTimer = setInterval(() => { recordSeconds.value += 1 }, 1000)
}

function stopRecording() {
  try {
    if (browserRecorder?.state === 'recording') browserRecorder.stop()
    appRecorder?.stop()
  } catch {
    // 已经停止时忽略
  }
  recording.value = false
  clearInterval(recordTimer)
}

/* ---------- 播放 ---------- */
function togglePlay(block: NoteBlock) {
  const src = blockSrc(block)
  if (!src) { toast('语音尚未就绪'); return }
  player?.destroy()
  player = uni.createInnerAudioContext()
  player.src = src
  player.play()
}

function waveHeights(seed: string) {
  const base = [8, 15, 22, 12, 18, 26, 11, 20, 14, 24, 9, 17, 21, 13, 25, 10, 19, 16, 23, 12]
  const offset = seed.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0)
  return base.map((height, i) => Math.max(6, (height + offset + i * 3) % 26))
}

/* ---------- 上传 ---------- */
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
          else reject(new Error(body.msg || '附件上传失败'))
        } catch {
          reject(new Error('附件上传失败'))
        }
      },
      fail: () => reject(new Error('附件上传失败'))
    })
  })
}

/** 附件上传：H5 的 blob: 地址由 uni.uploadFile 自行读取，App 用临时文件路径。 */
async function uploadLocal(block: NoteBlock): Promise<string> {
  const src = blockSrc(block)
  if (!src) throw new Error('附件不可用')
  return upload(src)
}

/* ---------- 保存 ---------- */
async function submit() {
  if (saving.value) return
  const title = form.title.trim()
  if (!title) { toast('给这条感悟起个标题'); return }
  if (recording.value) stopRecording()
  saving.value = true
  const pending = form.blocks.filter(block =>
    (block.type === 'image' || block.type === 'audio') && !block.url && blockSrc(block))
  uploadTotal.value = pending.length
  uploadDone.value = 0
  saveLabel.value = pending.length ? `上传附件 0/${pending.length}` : '保存中…'
  try {
    for (const block of pending) {
      block.url = await uploadLocal(block)
      uploadDone.value += 1
      saveLabel.value = `上传附件 ${uploadDone.value}/${uploadTotal.value}`
    }
    saveLabel.value = '保存中…'
    const attachments = form.blocks
      .filter((block): block is NoteBlock & { type: 'image' | 'audio' } =>
        (block.type === 'image' || block.type === 'audio') && !!block.url)
      .map(block => ({ kind: block.type, url: block.url as string }))
    const content = {
      chapter: form.chapter,
      tags: form.tags,
      blocks: form.blocks,
      summary: form.blocks.find(block => block.type === 'text')?.text?.slice(0, 80) || '',
      text: form.blocks.filter(block => block.type === 'text').map(block => block.text).join('\n\n'),
      attachments
    }
    if (editing.value && noteId.value) {
      const node = await fetchNode(noteId.value)
      await saveNode({ ...node, title }, stringifyContent(content))
      toast('已保存')
      uni.redirectTo({ url: `${ROUTES.note}?id=${noteId.value}` })
    } else {
      const created = await saveNode({
        id: newId(),
        parentId: parentId.value || null,
        nodeType: 'note',
        title,
        sortOrder: tree.value.filter(node => node.parentId === parentId.value && node.nodeType === 'note').length + 1
      } as BookNode, stringifyContent(content))
      clearDraft(store.account.value, currentDraftId())
      toast('已保存')
      uni.redirectTo({ url: `${ROUTES.note}?id=${created.id}` })
    }
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '保存失败，内容已保留')
  } finally {
    saving.value = false
    saveLabel.value = '保存'
  }
}

function newId() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => {
    const digit = Math.floor(Math.random() * 16)
    return (char === 'x' ? digit : (digit & 3) | 8).toString(16)
  })
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
    if (editing.value && noteId.value) {
      const node = await fetchNode(noteId.value)
      form.title = node.title
      const content = parseContent(node)
      form.chapter = content.chapter || ''
      form.tags = [...(content.tags || [])]
      form.blocks = blocksOf(node).length ? [...blocksOf(node)] : [makeBlock('text')]
      parentId.value = node.parentId || ''
      bookId.value = node.parentId || ''
    } else {
      bookId.value = pageOption('bookId', parentId.value)
      form.blocks = [makeBlock('text')]
    }
    // 有本机草稿时优先恢复（可能来自上次断网或误退）
    const local = readDraft<{
      title?: string
      chapter?: string
      tags?: string[]
      blocks?: NoteBlock[]
      parentId?: string
    }>(store.account.value, currentDraftId())
    if (local) {
      if (local.title !== undefined) form.title = local.title
      if (local.chapter !== undefined) form.chapter = local.chapter
      if (Array.isArray(local.tags)) form.tags = [...local.tags]
      if (Array.isArray(local.blocks) && local.blocks.length) form.blocks = local.blocks
      if (local.parentId) parentId.value = local.parentId
      toast('已恢复上次未提交的草稿')
    }
    draftReady = true
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '加载失败')
  } finally {
    loading.value = false
  }
}

onLoad(options => {
  noteId.value = pageOption('id', (options?.id as string) || '')
  parentId.value = pageOption('parentId', (options?.parentId as string) || '')
  editing.value = Boolean(noteId.value)
  if (requireLogin()) void load()
})
</script>

<style scoped>
.scroll {
  flex: 1;
  min-height: 0;
  padding: 4px 0 16px;
  box-sizing: border-box;
}

.editor-top { padding: 4px 16px 0; }
.title-input {
  width: 100%;
  border: 0;
  background: none;
  outline: none;
  padding: 0;
  font-family: var(--serif);
  font-size: 20px;
  font-weight: 650;
  line-height: 1.45;
  color: var(--ink-900);
}
.editor-meta { display: flex; gap: 7px; padding: 10px 0 0; flex-wrap: wrap; }
.chip-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 11px;
  border-radius: 999px;
  border: 1px dashed var(--line-strong);
  background: var(--surface);
  color: var(--ink-500);
  font-size: 11.5px;
  margin: 0;
  line-height: 26px;
}
.chip-btn.set { border-style: solid; border-color: var(--wood-200); background: var(--wood-100); color: var(--wood-900); }

.editor-body { padding: 16px 16px 0; }
.ed-block { position: relative; padding: 2px 0; }
.ed-block + .ed-block { margin-top: 12px; }
.drag { position: absolute; left: -13px; top: 8px; color: var(--ink-300); }
.ed-textarea {
  width: 100%;
  border: 0;
  background: none;
  outline: none;
  padding: 0;
  font-size: 14px;
  line-height: 1.95;
  color: var(--ink-900);
  min-height: 28px;
  box-sizing: border-box;
}
.quote-textarea { min-height: 54px; font-family: var(--serif); font-size: 13.5px; }
.quote-edit { border-left: 2.5px solid var(--wood-400); padding-left: 12px; }
.quote-foot { display: flex; align-items: center; gap: 8px; margin-top: 4px; }
.page-input {
  width: 120px;
  border: 1px solid var(--line);
  border-radius: 7px;
  padding: 5px 9px;
  font-size: 11.5px;
  background: var(--surface-2);
  color: var(--ink-700);
}
.quote-foot .icon-btn { margin-left: auto; }

.ed-imgbox { position: relative; border-radius: 9px; overflow: hidden; border: 1px solid var(--line); background: var(--surface); }
.ed-img-block { display: flex; flex-direction: column; gap: 7px; }
.ed-image { width: 100%; display: block; }

/* 图片说明：带图标的浅底输入条，始终可见 */
.cap-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--ink-400);
}
.cap-input {
  flex: 1;
  min-width: 0;
  border: 0;
  background: transparent;
  padding: 0;
  font-size: 12px;
  color: var(--ink-700);
  outline: none;
  height: 22px;
  line-height: 22px;
}
.ed-photo { min-height: 150px; }
.ed-imgbox .rm {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 0;
  background: rgba(255, 255, 255, 0.94);
  color: var(--ink-600);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
}


.rec {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 13px;
  background: var(--red-100);
  border: 1px solid #ead3cc;
  border-radius: 10px;
  margin-top: 12px;
}
.dotlive { width: 8px; height: 8px; border-radius: 50%; background: var(--red-500); }
.rec-time { font-size: 12px; color: var(--red-700); }
.rec-wave { flex: 1; display: flex; align-items: center; gap: 2px; height: 22px; overflow: hidden; }
.rec-bar { width: 2.5px; background: var(--red-500); border-radius: 2px; opacity: 0.5; }
.rec-stop {
  flex: 0 0 auto;
  height: 27px;
  padding: 0 12px;
  border-radius: 999px;
  border: 0;
  background: var(--red-500);
  color: #fff;
  font-size: 11.5px;
  margin: 0;
  line-height: 27px;
}

.insert-bar {
  margin: 18px 16px 0;
  padding-top: 12px;
  border-top: 1px dashed var(--line);
  display: flex;
  gap: 7px;
  overflow-x: auto;
}
.insert-bar .tool { height: 34px; padding: 0 13px; font-size: 12px; }

.editor-hint { display: block; padding: 14px 16px 6px; line-height: 1.75; }
</style>
