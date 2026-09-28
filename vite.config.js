import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const proxy = { '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true } }
export default defineConfig({
  plugins: [react()],
  server: { host: '127.0.0.1', proxy },
  preview: { host: '127.0.0.1', proxy },
})
