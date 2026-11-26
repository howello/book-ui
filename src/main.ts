import { createSSRApp } from 'vue'
import App from './App.vue'

export function createApp() {
  return { app: createSSRApp(App) }
}

// #ifdef H5
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'book-sw.js').catch(console.warn)
  })
}
// #endif
