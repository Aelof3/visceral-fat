import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Use relative paths for Electron compatibility
  base: './',
  build: {
    // Ensure assets use relative paths
    assetsDir: 'assets',
    // Generate source maps for debugging
    sourcemap: true,
  },
  server: {
    // Development server settings
    port: 5173,
    strictPort: true,
  },
})
