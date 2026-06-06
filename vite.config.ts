import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  root: 'demo',
  base: '/react-dockable-desktop/',
  plugins: [react()],
  build: {
    outDir: '../docs',
    emptyOutDir: true,
  }
})
