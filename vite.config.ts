import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  root: 'demo',
  plugins: [react()],
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  }
})
