import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  // Por defeito (dev e testes) as imagens vêm de /static; scripts/build.mjs escolhe a variante de cada destino.
  resolve: { alias: { 'home-images': fileURLToPath(new URL('./frontend/src/homeImages.static.js', import.meta.url)) } },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:5000',
      '/uploads': 'http://127.0.0.1:5000',
      '/simulations': 'http://127.0.0.1:5000',
    },
  },
  test: { include: ['tests/**/*.test.js'], environment: 'jsdom', restoreMocks: true },
})
