import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built site works from any folder or static host (e.g. GitHub Pages).
  base: './',
  build: {
    // The course/section snapshot is bundled on purpose (~200 KB gzipped) so the app works offline.
    chunkSizeWarningLimit: 1600,
  },
})
