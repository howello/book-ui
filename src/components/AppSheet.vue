<template>
  <view v-if="modelValue" class="sheet-host">
    <view class="overlay" @click="close" />
    <view class="sheet" :class="{ tall }">
      <view class="sheet-grip" />
      <view class="sheet-head">
        <view class="sheet-heading">
          <text class="sheet-title">{{ title }}</text>
          <text v-if="subtitle" class="sheet-sub">{{ subtitle }}</text>
        </view>
        <button class="sheet-close" aria-label="关闭" @click="close">
          <AppIcon name="close" :size="15" />
        </button>
      </view>
      <slot />
    </view>
  </view>
</template>

<script setup lang="ts">
import AppIcon from './AppIcon.vue'

/** 底部抽屉：长按菜单、分类操作、新建分类等共用。 */
const props = withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  subtitle?: string
  /** 内容较多时（查找面板）允许更高 */
  tall?: boolean
}>(), { title: '', subtitle: '', tall: false })

const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>()

function close() {
  emit('update:modelValue', false)
}
</script>

<style scoped>
.sheet {
  max-height: 88vh;
}

.sheet-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.sheet-heading {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.sheet-title {
  font-family: var(--serif);
  font-size: 16px;
  font-weight: 600;
  color: var(--ink-900);
}

.sheet-sub {
  font-size: 11.5px;
  color: var(--ink-400);
  line-height: 1.5;
}

.sheet-close {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  border: 1px solid var(--line-strong);
  background: var(--surface);
  color: var(--ink-500);
  padding: 0;
  margin: 0;
}
</style>
