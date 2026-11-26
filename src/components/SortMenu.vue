<template>
  <view class="sort-menu">
    <button class="sort-trigger" :aria-label="'排序：' + options[index]" @click="open = true">
      <text>{{ options[index] }}</text>
      <AppIcon name="chev" :size="10" class="chev-down" />
    </button>

    <view v-if="open" class="sort-mask" @click="open = false" />
    <view v-if="open" class="sort-pop" :class="{ left: align === 'left' }">
      <button
        v-for="(option, i) in options"
        :key="option"
        class="sort-option"
        :class="{ on: i === index }"
        @click="choose(i)"
      >
        <text>{{ option }}</text>
        <AppIcon v-if="i === index" name="check" :size="13" />
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import AppIcon from './AppIcon.vue'

/**
 * 轻量下拉选择：点触发按钮弹出选项浮层。
 * 不用原生 picker，避免各端交互与样式不一致，也让排序入口保持统一。
 */
const props = withDefaults(defineProps<{
  options: string[]
  index: number
  /** 弹层对齐方向：right 默认贴右，left 用于放在页面左上角的入口 */
  align?: 'left' | 'right'
}>(), { align: 'right' })

const emit = defineEmits<{ change: [index: number] }>()

const open = ref(false)

function choose(i: number) {
  open.value = false
  emit('change', i)
}
</script>

<style scoped>
.sort-menu { position: relative; display: inline-flex; }

.sort-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 27px;
  padding: 0 10px;
  margin: 0;
  border-radius: 999px;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink-600);
  font-size: 11.5px;
  line-height: 25px;
}

.chev-down { transform: rotate(90deg); }

.sort-mask { position: fixed; inset: 0; z-index: 60; }

.sort-pop {
  position: absolute;
  right: 0;
  top: 32px;
  min-width: 132px;
  z-index: 61;
  padding: 5px;
  border-radius: 11px;
  border: 1px solid var(--line);
  background: var(--paper-2);
  box-shadow: 0 8px 24px -10px rgba(74, 53, 32, 0.45);
}

.sort-pop.left {
  right: auto;
  left: 0;
}

.sort-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 34px;
  padding: 0 9px;
  margin: 0;
  border: 0;
  border-radius: 7px;
  background: none;
  color: var(--ink-600);
  font-size: 12.5px;
  line-height: 34px;
  text-align: left;
}

.sort-option.on {
  background: var(--wood-100);
  color: var(--wood-900);
  font-weight: 600;
}
</style>
