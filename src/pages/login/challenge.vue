<template>
  <web-view v-if="url" :src="url" :update-title="false" @message="receiveChallenge" />
  <view v-else role="status">人机校验页面尚未配置，请联系管理员</view>
</template>

<script setup lang="ts">
import { getCurrentInstance, ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const page = getCurrentInstance()?.proxy as { getOpenerEventChannel?: () => UniApp.EventChannel } | undefined
const url = ref('')
let completed = false

onLoad((options) => {
  const pageUrl = import.meta.env.VITE_APP_TURNSTILE_PAGE?.trim()
  const siteKey = options?.siteKey
  if (pageUrl && /^https:\/\/[a-z0-9.-]+(?::[0-9]+)?\/[^?#]+$/i.test(pageUrl) && siteKey) {
    url.value = pageUrl + '?native=1&siteKey=' + encodeURIComponent(siteKey)
  }
})

/** 把校验令牌交还当前登录页，关闭承载页。 */
function receiveChallenge(event: { detail?: { data?: Array<{ type?: string; token?: string }> } }) {
  const result = event.detail?.data?.find((item) => item?.type === 'book-turnstile' && typeof item.token === 'string')
  const channel = page?.getOpenerEventChannel?.()
  if (!completed && result?.token && channel) {
    completed = true
    channel.emit('verified', result.token)
    uni.navigateBack()
  }
}
</script>
