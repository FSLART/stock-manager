import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// servido em stocklart.pt/harness (o subdomínio harness.stocklart.pt fica para quando o DNS deixar)
export default defineConfig({ base: '/harness/', plugins: [react()] })
