/* H5 同源 iframe 和 Android HTTPS WebView 共同承载 Cloudflare 挑战。 */
const parameters = new URLSearchParams(window.location.search)
const siteKey = parameters.get('siteKey')
const native = parameters.get('native') === '1'
const status = document.getElementById('status')
const retry = document.getElementById('retry')

/** 按平台回传校验结果，业务登录仍由孕期端发起。 */
function sendToken(token) {
  const message = { type: 'book-turnstile', token }
  if (native) {
    if (token) {
      window.uni.webView.postMessage({ data: message })
    }
  } else {
    window.parent.postMessage(message, window.location.origin)
  }
}

/** 清除过期结果并给出重试入口。 */
function showError(message) {
  sendToken('')
  status.textContent = message
  retry.hidden = false
}

/** 加载固定平台脚本，失败时允许重试。 */
function loadScript(src, loaded, failed) {
  const script = document.createElement('script')
  script.src = src
  script.onload = loaded
  script.onerror = failed
  document.head.appendChild(script)
}

/** 创建独立挑战，并回传签发的一次性令牌。 */
function renderChallenge() {
  loadScript('https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', () => {
    window.turnstile.ready(() => {
      try {
        window.turnstile.render('#challenge', {
          sitekey: siteKey,
          size: 'flexible',
          'response-field': false,
          'refresh-expired': 'manual',
          callback: (token) => {
            status.textContent = '人机校验已完成'
            sendToken(token)
          },
          'expired-callback': () => showError('人机校验已过期'),
          'error-callback': () => showError('人机校验失败')
        })
        status.textContent = ''
      } catch {
        showError('人机校验加载失败')
      }
    })
  }, () => showError('人机校验加载失败'))
}

retry.addEventListener('click', () => window.location.reload())
if (!siteKey) {
  status.textContent = '人机校验尚未配置'
} else if (native) {
  document.body.classList.add('native')
  document.addEventListener('UniAppJSBridgeReady', renderChallenge, { once: true })
  loadScript('./uni.webview.1.5.8.js', null, () => showError('人机校验页面加载失败'))
} else {
  renderChallenge()
}
