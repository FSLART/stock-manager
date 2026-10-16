import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/uploads': 'http://127.0.0.1:5000',
      '/simulations': 'http://127.0.0.1:5000',
    },
  },
  test: { include: ['tests/**/*.test.js'], environment: 'jsdom', restoreMocks: true },
})
