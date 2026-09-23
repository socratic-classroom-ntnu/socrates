import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'

export default defineConfig({
  plugins: [pluginReact()],
  source: { entry: { index: './src/main.tsx' } },
  html: { template: './index.html', title: 'Socrates · 對話室' },
  server: {
    host: '0.0.0.0', port: 5173, strictPort: true,
    proxy: { '/api': { target: process.env.SOCRATES_DEV_API_ORIGIN || 'http://backend:8000', ws: true } },
  },
  output: { distPath: { root: 'dist' }, assetPrefix: '/' },
})
