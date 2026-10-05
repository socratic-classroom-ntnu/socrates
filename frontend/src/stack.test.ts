import fs from 'node:fs'
import path from 'node:path'

// 前端以 TypeScript 為準（見 STACK-CONTRACT.json）。.js／.jsx 一旦出現在 src/，
// 就會回到 R80 之後「執行 JS、型別檢查 TS」的雙軌。.mjs 是 avatar runtime，另有 .d.mts 宣告。
function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(path.join(dir, entry.name)) : [path.join(dir, entry.name)],
  )
}

test('src 沒有 .js／.jsx 原始碼', () => {
  const offenders = walk(__dirname)
    .map((file) => path.relative(__dirname, file).split(path.sep).join('/'))
    .filter((file) => /\.(js|jsx|cjs)$/.test(file))
  expect(offenders).toEqual([])
})
