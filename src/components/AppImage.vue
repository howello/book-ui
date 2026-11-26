<template>
  <view class="app-image" :class="{ fill, loading: !loaded && !failed }" :style="[wrapStyle, placeholderStyle]">
    <view v-if="!loaded && !failed" class="img-skeleton" :class="rounded ? 'rounded' : ''" />
    <image
      v-if="src && !failed"
      class="app-image-inner"
      :class="{ 'is-loaded': loaded, rounded }"
      :src="src"
      :mode="mode"
      :style="innerStyle"
      @load="onLoad"
      @error="onError"
    />
    <slot v-if="failed" name="fallback" />
  </view>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/**
 * 带骨架的图片。
 *
 * <p>图片真正解码完成前显示木色微光骨架，加载后淡入；
 * 失败时交给调用方通过 `fallback` 插槽兜底（通常是文字封面）。</p>
 */
const props = withDefaults(defineProps<{
  src?: string
  mode?: 'aspectFill' | 'aspectFit' | 'widthFix' | 'scaleToFill'
  rounded?: boolean
  /** 绝对定位铺满父容器（父级需 position: relative） */
  fill?: boolean
  /**
   * 加载前的占位比例（宽/高），如 '4 / 3'。
   * widthFix 模式下不给比例的话容器高度为 0，骨架会看不见。
   */
  ratio?: string
  /** 外层尺寸，例如 width/height/inset 组合 */
  wrapStyle?: string | Record<string, string>
  innerStyle?: string | Record<string, string>
}>(), { src: '', mode: 'aspectFill', rounded: false, fill: false, ratio: '', wrapStyle: '', innerStyle: '' })

const loaded = ref(false)
const failed = ref(false)

/** 未加载且配置了比例时，先把占位撑开，骨架才有可见高度。 */
const placeholderStyle = computed(() => {
  if (loaded.value || failed.value || !props.ratio) return {}
  return { aspectRatio: props.ratio, height: 'auto', minHeight: '120px' }
})

// 换图时重置状态，重新走一遍骨架
watch(() => props.src, () => {
  loaded.value = false
  failed.value = false
})

function onLoad() {
  loaded.value = true
}

function onError() {
  failed.value = true
}
</script>

<style scoped>
.app-image { position: relative; overflow: hidden; }

/* 铺满模式：父级已定尺寸时用它，避免高度塌陷 */
.app-image.fill {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.app-image.loading .app-image-inner {
  /* widthFix 时未加载的图片高度为 0，交给外层占位撑开 */
  position: absolute;
  inset: 0;
  opacity: 0;
}

.app-image-inner {
  opacity: 0;
  transition: opacity 0.22s ease;
  width: 100%;
  height: 100%;
  display: block;
}

.app-image-inner.is-loaded { opacity: 1; }
</style>
