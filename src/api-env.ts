/** H5 开发经代理，发布默认经同源 API。原生端通过部署环境配置绝对地址。 */
export function baseApi() {
  let configured = import.meta.env.VITE_APP_BASE_API?.trim()
  // #ifdef APP-PLUS
  configured = import.meta.env.VITE_APP_BASE_API_PHONE?.trim() || configured
  const scheme = import.meta.env.MODE === 'production' ? /^https:\/\//i : /^https?:\/\//i
  if (!configured || !scheme.test(configured)) return ''
  // #endif
  return (configured || (import.meta.env.DEV ? '/dev-api' : '/api')).replace(/\/+$/, '')
}

/** 隔离同一安装或站点中不同环境的登录态、草稿和已访问缓存。 */
export const bookStoragePrefix = import.meta.env.MODE === 'staging' ? 'book-stage'
  : import.meta.env.DEV ? 'book-dev' : 'book'
