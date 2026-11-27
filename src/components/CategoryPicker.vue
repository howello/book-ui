<template>
  <button class="category-picker-trigger" :aria-label="label" @click="open">
    <text>{{ caption }}</text>
    <AppIcon name="chev" :size="14" />
  </button>
  <AppSheet v-model="opened" title="选择分类" tall>
    <view class="picker-path">
      <button v-if="trail.length" class="btn xs line" @click="up">上一级</button>
      <text>{{ trail.map(node => node.title).join(' / ') || '书架根目录' }}</text>
    </view>
    <button v-if="trail.length || allowRoot" class="btn line sheet-btn" @click="choose">
      {{ trail.length ? '选这个分类' : '选书架根目录' }}
    </button>
    <scroll-view class="picker-level" scroll-y>
      <text v-if="error" class="tiny">{{ error }}</text>
      <text v-else-if="loading" class="tiny">正在加载</text>
      <text v-else-if="!options.length" class="tiny">此处没有子分类</text>
      <button v-for="node in options" :key="node.id" class="btn line sheet-btn" @click="down(node)">
        {{ node.title }}<AppIcon name="chev" :size="13" />
      </button>
    </scroll-view>
  </AppSheet>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import AppSheet from './AppSheet.vue'
import { fetchNodePath, fetchNodes } from '../shared/store'
import type { BookNode } from '../shared/types'

const props = withDefaults(defineProps<{
  modelValue?: string | null
  allowRoot?: boolean
  excluded?: string
  label?: string
}>(), { modelValue: null, allowRoot: false, excluded: '', label: '选择分类' })
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>()
const opened = ref(false)
const trail = ref<BookNode[]>([])
const options = ref<BookNode[]>([])
const loading = ref(false)
const error = ref('')
const selected = ref('')
const caption = computed(() => selected.value || (props.allowRoot ? '书架根目录' : '请选择分类'))
let sequence = 0

watch(() => props.modelValue, (id, _, cleanup) => {
  let active = true
  cleanup(() => { active = false })
  selected.value = ''
  if (id) void fetchNodePath(id).then(rows => {
    if (active) selected.value = rows.map(node => node.title).join(' / ')
  }).catch(() => undefined)
}, { immediate: true })

async function load() {
  const current = ++sequence
  const parentId = trail.value[trail.value.length - 1]?.id || null
  options.value = []
  loading.value = true
  error.value = ''
  const apply = (rows: BookNode[]) => {
    if (current !== sequence) return
    options.value = rows.filter(node => node.nodeType === 'category' && node.id !== props.excluded)
    loading.value = false
  }
  try {
    apply(await fetchNodes({ parentId }, apply))
  } catch (failure) {
    if (current === sequence) {
      error.value = failure instanceof Error ? failure.message : '无法读取分类'
      loading.value = false
    }
  }
}

function open() {
  trail.value = []
  opened.value = true
  void load()
}

function down(node: BookNode) {
  trail.value = [...trail.value, node]
  void load()
}

function up() {
  trail.value = trail.value.slice(0, -1)
  void load()
}

function choose() {
  emit('update:modelValue', trail.value[trail.value.length - 1]?.id || null)
  opened.value = false
}
</script>

<style scoped>
.category-picker-trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 6px 12px;
  text-align: left;
  line-height: 1.5;
  font-size: 13px;
  color: var(--ink-700);
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 8px;
}
.category-picker-trigger text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.picker-path { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; overflow-wrap: anywhere; }
.picker-level { max-height: 48vh; }
</style>
