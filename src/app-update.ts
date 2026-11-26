import { baseApi } from './api-env'

interface WidgetVersion {
  versionName: string
  versionCode: number
}

interface AppUpdate {
  appKey: string
  update?: boolean
  versionName?: string
  versionCode?: number
  wgtUrl?: string
  updateLog?: string
  forceUpdate?: boolean
}

interface InstallRuntime {
  appid: string
  getProperty(id: string, callback: (data?: { version?: string; versionCode?: string | number }) => void): void
  install(path: string, options: { force: boolean }, success: () => void, fail: (error: { message?: string }) => void): void
  restart(): void
}

declare const plus: { runtime?: InstallRuntime } | undefined

let started = false
let inFlight: Promise<'latest' | void> | undefined
let installedUpdate: AppUpdate | undefined

/** App 的逻辑层通过 5+ 全局对象访问原生运行时。 */
function nativeAppRuntime() {
  return typeof plus === 'undefined' ? undefined : plus.runtime
}

/** 热更新后原生壳版本不会变化，检查更新与关于页均读取当前运行的 WGT 版本。 */
export function readWidgetVersion(): Promise<WidgetVersion | null> {
  return new Promise((resolve) => {
    const runtime = nativeAppRuntime()
    if (!runtime?.appid || !runtime.getProperty) return resolve(null)
    try {
      runtime.getProperty(runtime.appid, (data) => {
        const versionName = data?.version?.trim()
        const versionCode = Number(data?.versionCode)
        resolve(versionName && Number.isSafeInteger(versionCode) && versionCode > 0
          ? { versionName, versionCode } : null)
      })
    } catch {
      resolve(null)
    }
  })
}

/** 版本检测接口允许匿名访问，冷启动时无需等待登录。 */
function fetchUpdate(current: WidgetVersion): Promise<AppUpdate> {
  if (!baseApi()) return Promise.reject(new Error("请配置 App 后端地址"))
  return new Promise((resolve, reject) => {
    uni.request({
      url: `${baseApi()}/app/version/check`,
      method: 'GET',
      data: { appKey: 'book', ...current },
      timeout: 10000,
      success: ({ statusCode, data }) => {
        const body = data as { code?: number; data?: AppUpdate } | undefined
        if (statusCode === 200 && body?.code === 200 && body.data) {
          resolve(body.data)
        } else {
          reject(new Error('检查更新失败'))
        }
      },
      fail: () => reject(new Error('网络异常，检查更新失败'))
    })
  })
}

function confirm(options: UniApp.ShowModalOptions): Promise<boolean> {
  return new Promise((resolve, reject) => {
    uni.showModal({
      ...options,
      success: ({ confirm }) => resolve(confirm),
      fail: () => reject(new Error('无法显示更新提示'))
    })
  })
}

function versionText(update: AppUpdate) {
  return update.versionName ? `新版本 v${update.versionName}` : '新版本'
}

async function promptRestart(runtime: InstallRuntime, update: AppUpdate) {
  const confirmed = await confirm({
    title: '更新已就绪',
    content: [`${versionText(update)} 已安装，重启后生效。`, update.updateLog].filter(Boolean).join('\n\n'),
    cancelText: '稍后',
    confirmText: '立即重启'
  })
  if (confirmed) runtime.restart()
}

async function downloadAndInstall(runtime: InstallRuntime, url: string, showLoading: boolean) {
  if (showLoading) uni.showLoading({ title: '正在更新', mask: true })
  try {
    const file = await new Promise<string>((resolve, reject) => {
      uni.downloadFile({
        url,
        success: (response) => response.statusCode === 200 && response.tempFilePath
          ? resolve(response.tempFilePath) : reject(new Error('更新包下载失败')),
        fail: () => reject(new Error('更新包下载失败'))
      })
    })
    await new Promise<void>((resolve, reject) => {
      runtime.install(file, { force: false }, resolve, (error) => reject(new Error(error.message || '更新安装失败')))
    })
  } finally {
    if (showLoading) uni.hideLoading()
  }
}

async function installRequiredUpdate(runtime: InstallRuntime, update: AppUpdate, url: string) {
  const content = [versionText(update), update.updateLog, '本次为强制更新，需要更新后才能继续使用。']
    .filter(Boolean).join('\n\n')
  while (!await confirm({ title: '发现新版本（必须更新）', content, showCancel: false, confirmText: '立即更新' })) {
    await new Promise<void>((resolve) => setTimeout(resolve, 400))
  }
  while (true) {
    try {
      await downloadAndInstall(runtime, url, true)
      break
    } catch (error) {
      const retry = await confirm({
        title: '更新失败',
        content: error instanceof Error ? error.message : '资源包下载或安装失败',
        showCancel: false,
        confirmText: '重试'
      })
      if (!retry) return
    }
  }
  installedUpdate = update
  runtime.restart()
}

async function runUpdate(manual: boolean): Promise<'latest' | void> {
  const runtime = nativeAppRuntime()
  if (!runtime?.install) throw new Error('此环境无法安装 App 更新')
  if (installedUpdate) return promptRestart(runtime, installedUpdate)

  const current = await readWidgetVersion()
  if (!current) throw new Error('无法读取当前应用版本')
  const update = await fetchUpdate(current)
  if (update.appKey !== 'book') throw new Error('悟的版本服务尚未开启')
  if (update.update === false) return 'latest'
  if (update.update !== true || !Number.isSafeInteger(update.versionCode)) throw new Error('更新版本信息无效')
  if (Number(update.versionCode) <= current.versionCode) return 'latest'
  const url = update.wgtUrl
  if (!url?.startsWith('https://')) throw new Error('更新包地址无效')

  if (update.forceUpdate === true) return installRequiredUpdate(runtime, update, url)
  await downloadAndInstall(runtime, url, manual)
  installedUpdate = update
  await promptRestart(runtime, update)
}

/** 启动检查与手动入口共用一次在途流程，避免重复下载安装或弹窗。 */
function runOnce(manual: boolean) {
  if (!inFlight) {
    inFlight = runUpdate(manual).finally(() => { inFlight = undefined })
  }
  return inFlight
}

export async function checkAndUpdateApp() {
  if (started) return
  started = true
  try {
    await runOnce(false)
  } catch {
    // 启动时的检测或下载安装失败不打断用户。
  }
}

export async function checkAppUpdateManually() {
  if (await runOnce(true) === 'latest') {
    uni.showToast({ title: '当前已是最新版本', icon: 'none' })
  }
}
