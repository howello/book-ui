<template>
  <AppPage title="关于" back>
    <scroll-view class="scroll about" scroll-y>
      <view class="about-hero">
        <view class="app-logo-frame">
          <AppIcon name="book" :size="40" />
        </view>
        <text class="app-name">{{ manifest.name }}</text>
        <text class="app-description">分类 · 书本 · 感悟 · 备注，一棵能无限下钻的树</text>
        <text class="version-tag">v{{ info.version }}</text>
      </view>

      <view class="about-info">
        <view v-for="row in rows" :key="row.label" class="info-row">
          <text class="info-label">{{ row.label }}</text>
          <text class="info-value">{{ row.value || '—' }}</text>
        </view>
      </view>

      <!-- #ifdef APP-PLUS -->
      <button class="btn ghost update-button" :disabled="checkingUpdate" @click="checkUpdates">
        {{ checkingUpdate ? '正在检查…' : '检查更新' }}
      </button>
      <!-- #endif -->

      <text class="copyright">© {{ year }} {{ manifest.name }} · 保留所有权利</text>
    </scroll-view>
    <AppToast />
  </AppPage>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import AppPage from '../../components/AppPage.vue'
import AppToast from '../../components/AppToast.vue'
import AppIcon from '../../components/AppIcon.vue'
import manifest from '../../manifest.json'
import { checkAppUpdateManually, readWidgetVersion } from '../../app-update'
import { toast } from '../../shared/toast'

/** 关于页：与宝宝端保持一致的结构——品牌区 + 信息表 + 检查更新 + 版权。 */
const app = uni.getAppBaseInfo()
const system = uni.getSystemInfoSync()

const info = reactive({
  version: app.appVersion || manifest.versionName,
  build: String(app.appVersionCode || manifest.versionCode),
  id: app.appId || manifest.appid
})

const platform = import.meta.env.UNI_PLATFORM === 'h5' ? 'H5' : 'App · ' + (system.platform || 'Android')
const year = new Date().getFullYear()

const rows = computed(() => [
  { label: '版本号', value: info.version },
  { label: '构建号', value: info.build },
  { label: '应用标识', value: info.id },
  { label: '运行平台', value: platform },
  { label: '系统', value: system.system },
  { label: '设备', value: [system.brand, system.model].filter(Boolean).join(' ') }
])

const checkingUpdate = ref(false)

/** 检查 WGT 资源包更新，失败时给出可读提示。 */
async function checkUpdates() {
  if (checkingUpdate.value) return
  checkingUpdate.value = true
  try {
    await checkAppUpdateManually()
  } catch (failure) {
    toast(failure instanceof Error ? failure.message : '检查更新失败')
  } finally {
    checkingUpdate.value = false
  }
}

onShow(async () => {
  // 热更新后原生壳版本不变，这里读当前运行资源包的版本
  const current = await readWidgetVersion()
  if (!current) return
  info.version = current.versionName
  info.build = String(current.versionCode)
})
</script>

<style scoped>
.scroll {
  flex: 1;
  min-height: 0;
  padding: 16px 16px 16px;
  box-sizing: border-box;
}

.about-hero {
  display: grid;
  justify-items: center;
  gap: 7px;
  padding: 24px 15px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
}

.app-logo-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 78px;
  height: 78px;
  margin-bottom: 6px;
  border-radius: 22px;
  border: 1px solid var(--line);
  background: linear-gradient(150deg, #fffaf1, var(--wood-100));
  color: var(--wood-800);
  box-shadow: var(--shadow-book);
}

.theme-dark .app-logo-frame {
  background: linear-gradient(150deg, #33261a, #241f1b);
  border-color: var(--line-strong);
  color: var(--wood-300);
}

.app-name { font-family: var(--serif); font-size: 20px; font-weight: 700; }
.app-description { font-size: 12.5px; color: var(--ink-500); text-align: center; line-height: 1.6; }
.version-tag {
  margin-top: 3px;
  padding: 3px 11px;
  border-radius: 18px;
  background: var(--wood-100);
  color: var(--wood-900);
  font-size: 12px;
  font-weight: 650;
}

.about-info {
  margin-top: 11px;
  padding: 4px 15px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow-card);
}

.info-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 0;
  font-size: 13px;
}

.info-row + .info-row { border-top: 1px solid var(--line); }
.info-label { color: var(--ink-500); flex: 0 0 auto; }
.info-value { color: var(--ink-800); text-align: right; overflow-wrap: anywhere; }

.update-button { width: 100%; margin-top: 14px; }
.copyright { display: block; margin-top: 18px; text-align: center; font-size: 11px; color: var(--ink-300); }
</style>
