// 只給 e2e/style-baseline.spec.ts 用：對 build 產物（vite preview）和 dev server 各跑一次。
// 埠號避開 docker 的 5173 和 vite preview 預設的 4173，跟其他 session 的伺服器才不會撞。
import { defineConfig } from '@playwright/test'

const BUILD = 'http://127.0.0.1:4179'
const DEV = 'http://127.0.0.1:5179'

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.baseline/test-results',
  reporter: 'list',
  // 互動狀態要逐一強制再量，分組課的頁面一頁就要幾百次，單頁 15–30 秒是常態
  timeout: 180_000,
  fullyParallel: true,
  use: { locale: 'zh-TW', timezoneId: 'Asia/Taipei', deviceScaleFactor: 1 },
  projects: [
    { name: 'build', use: { baseURL: BUILD } },
    { name: 'dev', use: { baseURL: DEV } },
  ],
  webServer: [
    { command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4179 --strictPort', url: BUILD, timeout: 240_000 },
    { command: 'npx vite --host 127.0.0.1 --port 5179 --strictPort', url: DEV, timeout: 60_000 },
  ],
})
