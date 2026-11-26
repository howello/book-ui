<template>
  <view class="app-icon" :style="iconStyle" aria-hidden="true" />
</template>

<script lang="ts">
const files = import.meta.glob<string>('../static/icons/*.svg', { eager: true, query: '?raw', import: 'default' })
const masks = new Map(Object.entries(files).map(([path, source]) => [
  path.slice('../static/icons/'.length, -'.svg'.length),
  'url("data:image/svg+xml,' + encodeURIComponent(source) + '")'
]))
</script>

<script setup lang="ts">
import { computed } from 'vue'

/** 线性图标：把 src/static/icons 下的 SVG 转成 mask 使用，颜色跟随 currentColor。 */
const props = withDefaults(defineProps<{ name: string; size?: number | string }>(), { size: 16 })

const iconStyle = computed(() => {
  const size = typeof props.size === 'number' ? props.size + 'px' : props.size
  const mask = masks.get(props.name) || masks.get('book')
  return {
    '--icon-size': size,
    maskImage: mask,
    WebkitMaskImage: mask
  }
})
</script>

<style scoped>
.app-icon {
  display: inline-block;
  flex: 0 0 auto;
  width: var(--icon-size);
  height: var(--icon-size);
  background-color: currentColor;
  mask-size: contain;
  mask-position: center;
  mask-repeat: no-repeat;
  -webkit-mask-size: contain;
  -webkit-mask-position: center;
  -webkit-mask-repeat: no-repeat;
  pointer-events: none;
  vertical-align: middle;
}
</style>
