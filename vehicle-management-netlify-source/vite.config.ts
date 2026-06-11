import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 前端开发时把 /api 转发到后端 Express，避免跨域并支持飞书回调跳转
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
