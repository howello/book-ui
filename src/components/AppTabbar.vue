<template>
  <view class="tabbar">
    <button
      v-for="item in items"
      :key="item.key"
      class="tab"
      :class="{ on: item.key === current }"
      @click="go(item.key)"
    >
      <AppIcon :name="item.icon" :size="19" />
      <text>{{ item.label }}</text>
    </button>
  </view>
</template>

<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import { ROUTES } from '../shared/navigation'

/** 全局底栏：书架 / 知识树 / 我的。详情页也保留，点 Tab 随时可切换。 */
withDefaults(defineProps<{ current?: 'shelf' | 'mind' | 'mine' }>(), { current: 'shelf' })

const items = [
  { key: 'shelf' as const, label: '书架', icon: 'shelf', url: ROUTES.home },
  { key: 'mind' as const, label: '知识树', icon: 'map', url: ROUTES.mind },
  { key: 'mine' as const, label: '我的', icon: 'user', url: ROUTES.mine }
]

function go(key: 'shelf' | 'mind' | 'mine') {
  const item = items.find(entry => entry.key === key)
  if (!item) return
  const pages = getCurrentPages()
  const current = pages[pages.length - 1]?.route || ''
  if (current === item.url.replace(/^\//, '')) return
  uni.reLaunch({ url: item.url })
}
</script>
