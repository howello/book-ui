<template>
  <view class="cover-face" :style="paletteStyle">
    <view class="cover-art" :style="artStyle" />
    <template v-if="!image">
      <view class="text-block">
        <text class="cf-title">{{ title || '未命名' }}</text>
        <text v-if="author" class="cf-author">{{ author }}</text>
      </view>
    </template>
    <AppImage v-else class="cf-image" :src="image" mode="aspectFill" fill />
    <slot />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import AppImage from './AppImage.vue'
import { coverArt, coverPalette } from '../shared/covers'

/**
 * 封面绘制：颜色 + 图案（纯 CSS）和文字，或直接用图片。
 * 分类、书本、详情头、编辑预览共用同一套渲染，保证四处观感一致。
 */
const props = withDefaults(defineProps<{
  title?: string
  author?: string
  color?: string
  art?: string
  image?: string
  /** 文字封面在图片之上加一层压暗，保证深色封面上的文字可读 */
  shade?: boolean
}>(), { title: '', author: '', color: 'clay', art: 'plain', image: '', shade: false })

const palette = computed(() => coverPalette(props.color))
const paletteStyle = computed(() => ({
  background: palette.value.bg,
  color: palette.value.ink
}))
const artStyle = computed(() => {
  const art = coverArt(props.art)
  return { backgroundImage: art.image, backgroundSize: art.size }
})
</script>

<style scoped>
.cover-face {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: 13px 10px 11px 17px;
  box-sizing: border-box;
  overflow: hidden;
}

.cover-art {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.text-block {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex: 1;
  min-height: 0;
}

.cf-title {
  font-family: var(--serif);
  font-size: 15px;
  line-height: 1.35;
  font-weight: 600;
  letter-spacing: 0.02em;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.22);
  display: -webkit-box;
  -webkit-line-clamp: 4;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.cf-author {
  font-size: 9.5px;
  opacity: 0.84;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 图片铺满封面：定位交给 AppImage 的 fill 模式 */
.cf-image :deep(.app-image-inner) {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
