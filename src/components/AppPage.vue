<template>
  <view class="page book-page" :class="themeClass" :style="{ '--sk-cols': shelfColumns }">
    <view v-if="showNav" class="navbar">
      <button v-if="back" class="back" :aria-label="backLabel" @click="onBack">
        <text class="chev">‹</text>
      </button>
      <button v-else-if="backText" class="act act-left act-text" @click="onBack">{{ backText }}</button>
      <view class="title">
        <text class="title-main">{{ title }}</text>
        <text v-if="subtitle" class="sub">{{ subtitle }}</text>
      </view>
      <view class="nav-action">
        <slot name="action" />
      </view>
    </view>
    <view v-if="$slots.path" class="path">
      <slot name="path" />
    </view>
    <view class="body">
      <view v-if="loading" class="skeleton" :class="'skeleton-' + skeleton" aria-label="正在加载" role="status">
        <!-- 书架：两列封面卡 + 层板 -->
        <template v-if="skeleton === 'shelf'">
          <view class="sk-rows">
            <view v-for="row in 2" :key="row" class="sk-shelf-row">
              <view v-for="cell in shelfColumns" :key="cell" class="sk-book">
                <view class="sk-cover" />
                <view class="sk-line" />
              </view>
            </view>
            <view class="sk-plank" />
            <view class="sk-shelf-row">
              <view v-for="cell in shelfColumns" :key="cell" class="sk-book">
                <view class="sk-cover" />
                <view class="sk-line" />
              </view>
            </view>
            <view class="sk-plank" />
          </view>
        </template>

        <!-- 详情头 + 列表 -->
        <template v-else-if="skeleton === 'detail'">
          <view class="sk-hero">
            <view class="sk-hero-cover" />
            <view class="sk-hero-info">
              <view class="sk-line w60" />
              <view class="sk-line w40" />
              <view class="sk-line w80" />
            </view>
          </view>
          <view v-for="row in 3" :key="row" class="sk-entry">
            <view class="sk-line w30" />
            <view class="sk-line w70" />
            <view class="sk-line w90" />
          </view>
        </template>

        <!-- 卡片列表（我的 / 表单） -->
        <template v-else>
          <view v-for="row in 4" :key="row" class="sk-card">
            <view class="sk-line w50" />
            <view class="sk-line w80" />
          </view>
        </template>
      </view>
      <!-- 用 v-show 而不是 v-if：卸载页面内容会让 uni 的 scroll-view 持有失效引用 -->
      <view v-show="!loading" class="body-content">
        <slot />
      </view>
    </view>
    <slot name="footer" />
  </view>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { goBack } from '../shared/navigation'
import { useTheme } from '../shared/store'

/**
 * 页面外壳：自定义导航 + 可滚动正文 + 可选底栏。
 * 三个主 Tab 页与各详情页共用，保证顶栏高度、安全区和主题一致。
 */
const props = withDefaults(defineProps<{
  title?: string
  subtitle?: string
  /** 是否显示返回键 */
  back?: boolean
  /** 用文字代替返回箭头（如「取消」） */
  backText?: string
  backLabel?: string
  loading?: boolean
  /** 骨架形态：shelf 书架 / detail 详情 / list 卡片列表 */
  skeleton?: 'shelf' | 'detail' | 'list'
  /** 书架骨架每行卡片数 */
  shelfColumns?: number
  showNav?: boolean
}>(), {
  title: '', subtitle: '', back: false, backText: '', backLabel: '返回',
  skeleton: 'list', shelfColumns: 2, showNav: true
})

const theme = useTheme()
const themeClass = computed(() => (theme.theme === 'dark' ? 'theme-dark' : ''))

function onBack() {
  goBack()
}
</script>

<style scoped>
.book-page {
  height: 100vh;
  height: 100dvh;
  min-height: 100vh;
  min-height: 100dvh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.book-page > .navbar, .book-page > .path { flex-shrink: 0; }
.book-page > .navbar > .act { width: auto; min-width: 34px; }
.skeleton { padding: 14px 16px; overflow: hidden; }

/* 通用线条 */
.sk-line {
  height: 12px;
  border-radius: 6px;
  margin-bottom: 9px;
  background: linear-gradient(90deg, var(--wood-100) 25%, var(--wood-200) 37%, var(--wood-100) 63%);
  background-size: 400% 100%;
  animation: sk-shimmer 1.4s ease infinite;
}
.sk-line:last-child { margin-bottom: 0; }
.w30 { width: 30%; }
.w40 { width: 40%; }
.w50 { width: 50%; }
.w60 { width: 60%; }
.w70 { width: 70%; }
.w80 { width: 80%; }
.w90 { width: 90%; }

@keyframes sk-shimmer {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

/* 书架骨架 */
.sk-rows { padding: 0 2px; }
.sk-shelf-row {
  display: grid;
  grid-template-columns: repeat(var(--sk-cols, 2), minmax(0, 1fr));
  gap: 18px 13px;
  padding: 6px 8px 0;
}
.sk-book { display: flex; flex-direction: column; align-items: center; }
.sk-cover {
  width: 100%;
  aspect-ratio: 2 / 3;
  border-radius: 4px 7px 7px 4px;
  background: linear-gradient(90deg, var(--wood-100) 25%, var(--wood-200) 37%, var(--wood-100) 63%);
  background-size: 400% 100%;
  animation: sk-shimmer 1.4s ease infinite;
  margin-bottom: 8px;
}
.sk-plank {
  height: 14px;
  margin: 10px 0 22px;
  border-radius: 2px 2px 4px 4px;
  background: linear-gradient(180deg, var(--wood-200), var(--wood-300));
  opacity: 0.7;
}

/* 详情骨架 */
.sk-hero { display: flex; gap: 15px; padding: 4px 0 18px; }
.sk-hero-cover {
  width: 88px;
  flex: 0 0 88px;
  aspect-ratio: 2 / 3;
  border-radius: 4px 7px 7px 4px;
  background: linear-gradient(90deg, var(--wood-100) 25%, var(--wood-200) 37%, var(--wood-100) 63%);
  background-size: 400% 100%;
  animation: sk-shimmer 1.4s ease infinite;
}
.sk-hero-info { flex: 1; min-width: 0; padding-top: 4px; }
.sk-entry {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 10px;
  background: var(--surface);
}

/* 卡片骨架 */
.sk-card {
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 12px;
  background: var(--surface);
}
.body {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.body-content {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 页面内的 scroll-view 统一撑满正文区 */
.body-content > :deep(uni-scroll-view) {
  flex: 1;
  min-height: 0;
}
</style>
