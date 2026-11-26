import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig({
  plugins: [uni()],
  server: {
    port: 5182,
    proxy: {
      '/dev-api': {
        target: 'http://localhost:9527',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/dev-api/, ''),
      },
      '/stage-api': {
        target: 'http://localhost:9527',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/stage-api/, ''),
      },
    },
  },
})
