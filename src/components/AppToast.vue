<template>
  <view class="toast-bar" :class="{ on: !!toastText }">{{ toastText }}</view>
</template>

<script setup lang="ts">
import { toastText } from '../shared/toast'

/** 全站共用的一条轻提示，样式与 demo 的 .toast 一致。 */
</script>
