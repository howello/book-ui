<template>
  <view class="book-cover">
    <CoverFace :title="title" :author="author" :color="color" :art="art" :image="image" />
    <view v-if="ribbon" class="book-ribbon" />
  </view>
</template>

<script setup lang="ts">
import CoverFace from './CoverFace.vue'

/** 书架上的 2:3 封面：书脊压暗、书页侧边与书签丝带。 */
withDefaults(defineProps<{
  title?: string
  author?: string
  color?: string
  art?: string
  image?: string
  ribbon?: boolean
}>(), { title: '', author: '', color: 'clay', art: 'plain', image: '', ribbon: false })
</script>

<style scoped>
.book-cover {
  position: relative;
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 3px 6px 6px 3px;
  overflow: hidden;
  background: var(--wood-200);
  box-shadow: var(--shadow-book);
}

.book-cover::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 9px;
  z-index: 3;
  background: linear-gradient(90deg, rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.07) 55%, rgba(255, 255, 255, 0.16) 100%);
}

.book-cover::after {
  content: "";
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  z-index: 3;
  background: repeating-linear-gradient(180deg, rgba(255, 255, 255, 0.85) 0 2px, rgba(0, 0, 0, 0.08) 2px 3px);
  opacity: 0.5;
}

.book-ribbon {
  position: absolute;
  top: -1px;
  right: 11px;
  width: 13px;
  height: 26px;
  z-index: 4;
  background: var(--red-500);
  clip-path: polygon(0 0, 100% 0, 100% 100%, 50% 76%, 0 100%);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
}
</style>
