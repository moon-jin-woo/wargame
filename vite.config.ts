import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/wargame/',
  plugins: [react()],
  build: {
    rollupOptions: {
      input: 'app.html',
    },
  },
})
