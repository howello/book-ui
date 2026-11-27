<template>
  <AppPage :loading="loading" :title="editing ? '编辑感悟' : '写感悟'" :subtitle="book ? `《${book.title}》` : ''" back :before-back="saveOnExit">
    <template #action>
      <button class="act act-text" :disabled="saving" :aria-busy="saving" @click="submit">
        <text v-if="saving" class="btn-spinner" />
        <text>{{ saving ? '保存中…' : '保存' }}</text>
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
        退出时自动保存。离线修改会在联网后自动上传。
      </text>
    </scroll-view>
    <AppToast />
</AppPage>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { onBackPress, onHide, onLoad, onUnload } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import AppToast from '../../components/AppToast.vue'
import AppIcon from '../../components/AppIcon.vue'
import AppImage from '../../components/AppImage.vue'
import { bookStoragePrefix } from '../../api-env'
import { ROUTES } from '../../shared/navigation'
import { fetchNode, fetchNodePath, useBookStore } from '../../shared/store'
import type { BookNode, NoteBlock } from '../../shared/types'
import { blocksOf, parseContent, stringifyContent } from '../../shared/types'
import { newId, pageOption, requireLogin } from '../../shared/use-book'
import { formatDuration, keepNoteMedia, newLocalKey, saveLocalBlob, useNoteMedia } from '../../shared/media'
import { toast } from '../../shared/toast'
import { queueNote } from '../../shared/note-sync'
import { pendingNote } from '../../shared/pending-notes'

const store = useBookStore()
const noteId = ref('')
const parentId = ref('')
const bookId = ref('')
const tree = ref<BookNode[]>([])
const saving = ref(false)
const editing = ref(false)

const form = reactive({
  title: '',
  chapter: '',
  tags: [] as string[],
  blocks: [] as NoteBlock[]
})

let baseNode: BookNode | undefined
let account = ''
let revision: string | undefined
let legacyKey = ''
let savedForm = ''
let leftEditor = false
let ready = false

const book = computed(() => tree.value.find(node => node.id === bookId.value))
const blockSrc = useNoteMedia(() => account, () => form.blocks)
let player: UniApp.InnerAudioContext | undefined

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
    pickImage(form.blocks[form.blocks.length - 1])
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

/** 在图库选中后立即保存原文件，退出或重启后仍可上传。 */
function pickImage(block: NoteBlock) {
  uni.chooseImage({
    count: 1,
    sourceType: ['album', 'camera'],
    success: async result => {
      const path = Array.isArray(result.tempFilePaths) ? result.tempFilePaths[0] : result.tempFilePaths
      if (!path || !account || account !== store.account.value) return
      try {
        const key = await keepNoteMedia(account, path)
        if (account !== store.account.value || !form.blocks.some(item => item.id === block.id)) return
        block.localKey = key
        block.url = ''
        if (leftEditor) saveOnExit()
      } catch {
        toast('图片保存失败')
      }
    },
    fail: failure => {
      if (!failure.errMsg.includes('cancel')) toast('无法选择图片，请检查权限')
    }
  })
}

const recording = ref(false)
const recordSeconds = ref(0)
let recordTimer: ReturnType<typeof setInterval> | undefined
let browserRecorder: MediaRecorder | undefined
let appRecorder: UniApp.RecorderManager | undefined
let recordCompletion: Promise<void> | undefined
let finishRecording: (() => void) | undefined

async function insertRecording(saveFile: () => Promise<string>) {
  const finish = finishRecording
  if (!finish) return
  finishRecording = undefined
  const duration = recordSeconds.value
  try {
    const key = await saveFile()
    if (account === store.account.value) {
      form.blocks.push({ ...makeBlock('audio'), localKey: key, duration })
      if (leftEditor) saveOnExit()
    }
  } catch {
    toast('语音保存失败')
  } finally {
    recordCompletion = undefined
    finish()
  }
}

function recBarHeight(index: number) {
  return 5 + Math.round(Math.abs(Math.sin(index * 1.7 + recordSeconds.value / 3)) * 16)
}

async function startRecording() {
  if (!ready || recording.value || recordCompletion) return
  // #ifdef H5
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('录音需要 HTTPS 与麦克风权限')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    if (leftEditor || account !== store.account.value) {
      stream.getTracks().forEach(track => track.stop())
      return
    }
    const chunks: BlobPart[] = []
    const recorder = new MediaRecorder(stream)
    browserRecorder = recorder
    recorder.ondataavailable = event => chunks.push(event.data)
    recorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop())
      void insertRecording(() => saveLocalBlob(newLocalKey(account),
        new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })))
    }
    recorder.start()
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '无法开始录音')
    return
  }
  // #endif
  // #ifdef APP-PLUS
  if (!appRecorder) {
    appRecorder = uni.getRecorderManager()
    appRecorder.onStop(result => { void insertRecording(() => keepNoteMedia(account, result.tempFilePath)) })
    appRecorder.onError(() => {
      stopRecording()
      finishRecording?.()
      finishRecording = undefined
      recordCompletion = undefined
      toast('录音失败')
    })
  }
  appRecorder.start({ format: 'aac' })
  // #endif
  recordCompletion = new Promise<void>(resolve => { finishRecording = resolve })
  recording.value = true
  recordSeconds.value = 0
  recordTimer = setInterval(() => { recordSeconds.value += 1 }, 1000)
}

function stopRecording() {
  if (!recording.value) return
  recording.value = false
  clearInterval(recordTimer)
  if (browserRecorder?.state === 'recording') browserRecorder.stop()
  appRecorder?.stop()
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

/** 离开页面前同步写本机，上传由应用级队列处理。 */
function persistNote(): boolean {
  if (!ready || account !== store.account.value) return false
  const snapshot = JSON.stringify(form)
  if (snapshot === savedForm) return Boolean(baseNode?.title)
  const blocks = form.blocks.filter(block =>
    block.type === 'text' || block.type === 'quote' || block.url || block.localKey)
  if (!baseNode?.title && !form.title.trim() && !form.chapter && !form.tags.length
      && !blocks.some(block => block.text?.trim() || block.url || block.localKey)) return false
  const title = form.title.trim() || baseNode?.title || '未命名感悟'
  const body = blocks.filter(block => block.type === 'text').map(block => block.text || '').join('\n\n')
  const node: BookNode = {
    ...baseNode,
    id: noteId.value,
    parentId: parentId.value,
    title,
    nodeType: 'note',
    sortOrder: baseNode?.sortOrder ?? tree.value.filter(item => item.parentId === parentId.value).length + 1,
    createdAt: baseNode?.createdAt || new Date().toISOString(),
    contentJson: stringifyContent({ ...parseContent(baseNode), chapter: form.chapter, tags: form.tags,
      blocks, summary: body.slice(0, 80), text: body })
  }
  revision = queueNote(account, node, revision)
  baseNode = node
  savedForm = snapshot
  if (legacyKey) {
    uni.removeStorageSync(legacyKey)
    legacyKey = ''
  }
  return true
}

function saveOnExit(): boolean {
  try {
    persistNote()
    return true
  } catch {
    toast('本机保存失败，请检查存储空间后重试')
    return false
  }
}

async function submit() {
  if (saving.value) return
  saving.value = true
  try {
    stopRecording()
    await recordCompletion
    if (!persistNote()) {
      toast('请先填写感悟')
      return
    }
    toast('已保存到本机')
    uni.redirectTo({ url: `${ROUTES.note}?id=${noteId.value}` })
  } catch {
    toast('本机保存失败，请检查存储空间后重试')
  } finally {
    saving.value = false
  }
}

const loading = ref(true)

async function load() {
  if (!store.token.value) return
  account = store.account.value
  try {
    if (editing.value) {
      revision = pendingNote(account, noteId.value)?.revision
      baseNode = await fetchNode(noteId.value)
      form.title = baseNode.title
      const content = parseContent(baseNode)
      form.chapter = content.chapter || ''
      form.tags = [...(content.tags || [])]
      form.blocks = blocksOf(baseNode)
      parentId.value = baseNode.parentId || ''
    }
    if (!parentId.value) throw new Error('找不到这条感悟所属的书本')
    bookId.value = parentId.value
    if (!form.blocks.length) form.blocks = [makeBlock('text')]
    savedForm = JSON.stringify(form)

    // 已有版本留下的内容仅在用户重新进入同一感悟或书本时接续。
    if (!revision) {
      const key = `${bookStoragePrefix}-draft:${account}:${editing.value ? noteId.value : 'new:note'}`
      const old = uni.getStorageSync(key)
      if (old && typeof old === 'object' && (editing.value || old.parentId === parentId.value)) {
        if (typeof old.title === 'string') form.title = old.title
        if (typeof old.chapter === 'string') form.chapter = old.chapter
        if (Array.isArray(old.tags)) form.tags = old.tags
        if (Array.isArray(old.blocks) && old.blocks.length) {
          form.blocks = old.blocks.map(({ localKey, path, ...block }: NoteBlock) => block)
        }
        legacyKey = key
      }
    }
    ready = account === store.account.value
    void fetchNodePath(bookId.value).then(rows => { tree.value = rows }).catch(() => undefined)
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '加载失败')
  } finally {
    loading.value = false
  }
}

onLoad(options => {
  const id = pageOption('id', (options?.id as string) || '')
  noteId.value = id || newId()
  parentId.value = pageOption('parentId', (options?.parentId as string) || '')
  editing.value = Boolean(id)
  if (requireLogin()) void load()
})

onBackPress(() => !saveOnExit())
onHide(saveOnExit)
onUnload(() => {
  leftEditor = true
  stopRecording()
  saveOnExit()
  player?.destroy()
})
// #ifdef H5
onMounted(() => window.addEventListener('pagehide', saveOnExit))
onUnmounted(() => window.removeEventListener('pagehide', saveOnExit))
// #endif
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
