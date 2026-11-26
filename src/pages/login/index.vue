<template>
  <view class="page login-page" :class="themeClass">
    <view class="login-shell">
      <view class="login-brand">
        <view class="logo-frame">
          <AppIcon name="book" :size="42" />
        </view>
        <text class="login-title">读书笔记</text>
        <text class="login-subtitle">把读过的书，放回自己的书架</text>
      </view>

      <view class="login-card">
        <view class="fields">
          <view class="field">
            <view class="label">
              <AppIcon name="account" :size="15" />
              <text>账号</text>
            </view>
            <input
              v-model="form.username"
              class="input"
              type="text"
              aria-label="账号"
              placeholder="请输入账号"
              :maxlength="30"
              confirm-type="next"
            />
          </view>
          <view class="field">
            <view class="label">
              <AppIcon name="lock" :size="15" />
              <text>密码</text>
            </view>
            <input
              v-model="form.password"
              class="input"
              type="password"
              aria-label="密码"
              placeholder="请输入密码"
              :maxlength="32"
              :confirm-type="captcha.captchaEnabled ? 'next' : 'done'"
              @confirm="!captcha.captchaEnabled && submit()"
            />
          </view>
          <view v-if="captcha.captchaEnabled" class="field captcha-row">
            <view class="captcha-main">
              <view class="label">
                <AppIcon name="shield" :size="15" />
                <text>验证码</text>
              </view>
              <input
                v-model="form.code"
                class="input"
                type="text"
                aria-label="验证码"
                placeholder="请输入验证码"
                :maxlength="6"
                confirm-type="done"
                @confirm="submit"
              />
            </view>
            <view class="captcha-img" role="button" aria-label="刷新验证码" @click="loadCaptcha">
              <image v-if="captcha.img" class="captcha-image" :src="captcha.img" mode="aspectFit" />
              <text v-else class="captcha-loading">点击刷新</text>
            </view>
          </view>
        </view>

        <view v-if="captcha.turnstileEnabled" class="human-verification">
          <!-- #ifdef H5 -->
          <iframe
            v-if="challengeUrl"
            ref="challengeFrame"
            :key="challengeUrl"
            :src="challengeUrl"
            title="人机校验"
          />
          <!-- #endif -->
          <!-- #ifdef APP-PLUS -->
          <button class="btn line" :disabled="submitting" @click="openChallenge">
            {{ hasChallengeToken() ? '人机校验已完成' : '完成人机校验' }}
          </button>
          <!-- #endif -->
          <text v-if="!captcha.turnstileSiteKey" class="form-error">人机校验尚未配置，请联系管理员</text>
        </view>

        <text v-if="errorText" class="form-error" role="status">{{ errorText }}</text>
        <button class="btn login-btn" :disabled="submitting" @click="submit">
          {{ submitting ? '登录中…' : '登录' }}
        </button>
        <text class="login-foot">书架、感悟与备注按账号隔离，换设备登录同一账号即可继续</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
// #ifdef H5
import { onMounted, onUnmounted } from 'vue'
// #endif
import AppIcon from '../../components/AppIcon.vue'
import { ROUTES } from '../../shared/navigation'
import { ApiError, request, setSession, useTheme } from '../../shared/store'

/** 验证码接口返回。字段与后台一致：平铺在响应顶层。 */
interface CaptchaResult {
  captchaEnabled?: boolean
  uuid?: string
  img?: string
  imgType?: string
  turnstileEnabled?: boolean
  turnstileSiteKey?: string
}

const theme = useTheme()
const themeClass = computed(() => (theme.theme === 'dark' ? 'theme-dark' : ''))

const form = reactive({ username: '', password: '', code: '' })
const captcha = reactive({
  captchaEnabled: false,
  uuid: '',
  img: '',
  turnstileEnabled: false,
  turnstileSiteKey: ''
})

const submitting = ref(false)
const errorText = ref('')
const challengeToken = ref('')
const challengeExpiresAt = ref(0)
const challengeRevision = ref(0)

/** 校验结果仅用于本次登录，并在 Cloudflare 令牌过期前失效。 */
function setChallengeToken(token: string) {
  challengeToken.value = token
  challengeExpiresAt.value = token ? Date.now() + 4 * 60 * 1000 : 0
}

/** 是否持有未使用且仍有效的令牌。 */
function hasChallengeToken() {
  return Boolean(challengeToken.value && challengeExpiresAt.value > Date.now())
}

/** 登录完成或失败后销毁旧令牌并重新加载挑战。 */
function resetChallenge() {
  setChallengeToken('')
  challengeRevision.value += 1
}

// #ifdef H5
const challengeFrame = ref<HTMLIFrameElement>()
const challengeUrl = computed(() => {
  if (!captcha.turnstileSiteKey) return ''
  // 用字符串拼接，避免 Android WebView 缺少 URL / URLSearchParams
  const base = import.meta.env.BASE_URL + 'static/turnstile/index.html'
  return base +
    '?siteKey=' + encodeURIComponent(captcha.turnstileSiteKey) +
    '&revision=' + encodeURIComponent(String(challengeRevision.value))
})

/** 只接收当前同源挑战框发送的结果。 */
function receiveChallenge(event: MessageEvent) {
  if (event.origin === window.location.origin &&
      event.source === challengeFrame.value?.contentWindow &&
      event.data?.type === 'book-turnstile' &&
      typeof event.data.token === 'string') {
    setChallengeToken(event.data.token)
  }
}

onMounted(() => window.addEventListener('message', receiveChallenge))
onUnmounted(() => window.removeEventListener('message', receiveChallenge))
// #endif

// #ifdef APP-PLUS
/** 打开 App 内的受信任 HTTPS 校验承载页。 */
function openChallenge() {
  if (!captcha.turnstileSiteKey) return
  setChallengeToken('')
  uni.navigateTo({
    url: ROUTES.challenge + '?siteKey=' + encodeURIComponent(captcha.turnstileSiteKey),
    events: { verified: setChallengeToken },
    fail: () => { errorText.value = '无法打开人机校验，请重试' }
  })
}
// #endif

/** 加载图形验证码；开关以服务端返回为准，缺失时不显示验证码。 */
async function loadCaptcha() {
  try {
    const body = await request<CaptchaResult & { data?: CaptchaResult }>('/captchaImage')
    const payload = (body as { data?: CaptchaResult }).data ?? body
    captcha.captchaEnabled = payload.captchaEnabled === true
    captcha.uuid = payload.uuid || ''
    captcha.img = payload.img ? 'data:image/' + (payload.imgType || 'gif') + ';base64,' + payload.img : ''
    captcha.turnstileEnabled = payload.turnstileEnabled === true
    const siteKey = captcha.turnstileEnabled ? payload.turnstileSiteKey || '' : ''
    if (siteKey !== captcha.turnstileSiteKey) {
      resetChallenge()
      captcha.turnstileSiteKey = siteKey
    }
  } catch (failure) {
    errorText.value = failure instanceof Error ? failure.message : '验证码加载失败，点击图片重试'
  }
}

/** 提交登录：成功后写入账号会话并进入书架。 */
async function submit() {
  if (submitting.value) return
  errorText.value = ''
  if (!form.username.trim()) { errorText.value = '请输入账号'; return }
  if (!form.password) { errorText.value = '请输入密码'; return }
  if (captcha.captchaEnabled && !form.code.trim()) { errorText.value = '请输入验证码'; return }
  if (captcha.turnstileEnabled && !hasChallengeToken()) { errorText.value = '请完成人机校验'; return }

  submitting.value = true
  try {
    const result = await request<{ token?: string }>('/login', 'POST', {
      username: form.username.trim(),
      password: form.password,
      code: form.code.trim(),
      uuid: captcha.uuid,
      client: 'book',
      ...(captcha.turnstileEnabled ? { turnstileToken: challengeToken.value } : {})
    })
    if (!result?.token) { errorText.value = '登录响应缺少凭证，请联系管理员'; return }
    // 先落 token，/getInfo 才带得上 Authorization
    setSession(result.token, '')
    const info = await request<{ user?: { userId?: number; userName?: string } }>('/getInfo')
    const userId = String(info?.user?.userId || '')
    if (!userId) { errorText.value = '无法读取账号信息，请重试'; return }
    setSession(result.token, userId)
    uni.reLaunch({ url: ROUTES.home })
  } catch (failure) {
    errorText.value = failure instanceof ApiError || failure instanceof Error ? failure.message : '登录失败'
    if (captcha.captchaEnabled) {
      form.code = ''
      void loadCaptcha()
    }
  } finally {
    if (captcha.turnstileEnabled) resetChallenge()
    submitting.value = false
  }
}

/** 先拿到 token 再请求 getInfo，因此这里临时写入后再补账号。 */
</script>

<style lang="scss" scoped>
.login-page {
  min-height: 100vh;
  display: block;
  background:
    radial-gradient(120% 70% at 12% 0%, rgba(255, 244, 226, 0.9), rgba(246, 241, 231, 0) 58%),
    var(--paper);
}

.theme-dark.login-page {
  background:
    radial-gradient(120% 70% at 12% 0%, rgba(122, 85, 51, 0.28), rgba(28, 25, 22, 0) 58%),
    var(--paper);
}

.login-shell {
  width: min(calc(100% - 36px), 410px);
  margin: 0 auto;
  padding: calc(28px + env(safe-area-inset-top)) 0 32px;
  display: grid;
  align-content: center;
  gap: 24px;
  min-height: 100vh;
  box-sizing: border-box;
}

.login-brand {
  display: grid;
  justify-items: center;
  gap: 4px;
  padding: 10px 8px 6px;
  text-align: center;
}

.logo-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  margin-bottom: 12px;
  border-radius: 30px;
  border: 1px solid var(--line);
  background: linear-gradient(150deg, #fffaf1, var(--wood-100));
  color: var(--wood-800);
  box-shadow: 0 10px 26px -14px rgba(74, 53, 32, 0.55), inset 0 1px 0 #fff;
}

.theme-dark .logo-frame {
  background: linear-gradient(150deg, #33261a, #241f1b);
  border-color: var(--line-strong);
  color: var(--wood-300);
  box-shadow: 0 10px 26px -14px rgba(0, 0, 0, 0.8);
}

.login-title {
  font-family: var(--serif);
  font-size: 27px;
  font-weight: 680;
  letter-spacing: 0.1em;
  line-height: 1.2;
  color: var(--ink-900);
}

.login-subtitle {
  margin-top: 6px;
  font-size: 12.5px;
  color: var(--ink-500);
  letter-spacing: 0.02em;
}

.login-card {
  display: grid;
  gap: 14px;
  padding: 18px 16px 16px;
  border-radius: 18px;
  background: var(--surface);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-card);
  box-sizing: border-box;
}

.fields { display: grid; gap: 11px; }

.fields .field {
  min-height: 66px;
  padding: 9px 12px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  box-sizing: border-box;
}

.fields .field:focus-within {
  border-color: var(--wood-400);
  box-shadow: 0 0 0 3px rgba(142, 100, 56, 0.1);
}

.fields .label {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 2px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-500);
  letter-spacing: 0.04em;
}

.fields .label .app-icon { color: var(--wood-600); }

.fields .input {
  border: 0;
  padding: 0;
  background: transparent;
  box-shadow: none;
  font-size: 14.5px;
  height: 30px;
  line-height: 30px;
}

.fields .input:focus { box-shadow: none; border: 0; }

.captcha-row {
  display: flex;
  align-items: stretch;
  gap: 10px;
}

.captcha-main { flex: 1; min-width: 0; }

.captcha-img {
  flex: 0 0 92px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 9px;
  background: var(--wood-100);
  border: 1px solid var(--line);
}

.captcha-image { width: 100%; height: 100%; }
.captcha-loading { font-size: 10.5px; color: var(--ink-400); }

.form-error {
  font-size: 12px;
  line-height: 1.5;
  color: var(--red-700);
}

.login-btn { width: 100%; min-height: 48px; margin-top: 2px; font-size: 15px; }

.login-foot {
  font-size: 11px;
  line-height: 1.6;
  text-align: center;
  color: var(--ink-300);
}

.human-verification iframe { display: block; width: 100%; height: 112px; border: 0; }
.human-verification button { width: 100%; }

@media (min-width: 720px) {
  .login-shell {
    width: min(calc(100% - 44px), 720px);
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1fr);
    align-items: center;
    gap: 38px;
  }
  .login-brand { min-height: 260px; align-content: center; }
  .login-card { padding: 24px; }
}
</style>
