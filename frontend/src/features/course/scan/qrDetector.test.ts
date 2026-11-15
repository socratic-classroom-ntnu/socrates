import fs from 'node:fs'
import path from 'node:path'

// 首頁不能因為掃描變大：辨識套件只能在掃描頁動態載入
test('the QR library is only loaded with a dynamic import', () => {
  const source = fs.readFileSync(path.join(__dirname, 'qrDetector.ts'), 'utf8')
  expect(source).toMatch(/import\(\s*['"]jsqr['"]\s*\)/)
  expect(source).not.toMatch(/^\s*import\s[^(]*['"]jsqr['"]/m)
})
