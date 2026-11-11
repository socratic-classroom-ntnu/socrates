// 比對兩次 computed style 基準：node e2e/compare-style.mjs <before> <after>
// 參數可以是單一 JSON 檔，或 style-baseline.spec.ts 輸出的資料夾（會比對底下同名的所有 JSON）。
// 有差異時逐條列出「頁面@寬度｜元素｜屬性：前 → 後」，並以 exit code 1 結束。
import fs from 'node:fs'
import path from 'node:path'

const [before, after] = process.argv.slice(2)
if (!before || !after) {
  console.error('usage: node e2e/compare-style.mjs <before.json|dir> <after.json|dir>')
  process.exit(2)
}

function files(target) {
  if (fs.statSync(target).isFile()) return { [path.basename(target)]: target }
  const found = {}
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.json')) found[path.relative(target, full)] = full
    }
  }
  walk(target)
  return found
}

// 兩邊都是單一檔案時直接配對（檔名不同也比，例如 before.json、after.json）；否則照資料夾裡的相對路徑配對
const single = fs.statSync(before).isFile() && fs.statSync(after).isFile()
const left = single ? { [path.basename(after)]: before } : files(before)
const right = single ? { [path.basename(after)]: after } : files(after)
const lines = []
for (const name of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
  if (!left[name] || !right[name]) { lines.push(`${name}｜只在${left[name] ? '前' : '後'}面有這一頁`); continue }
  const a = JSON.parse(fs.readFileSync(left[name], 'utf8'))
  const b = JSON.parse(fs.readFileSync(right[name], 'utf8'))
  if (a.path !== b.path) lines.push(`${name}｜網址 ${a.path} → ${b.path}`)
  // 量哪些屬性由「生效規則宣告過的屬性」決定；某個屬性只在一邊量，代表樣式表新增或刪掉了這種屬性。
  // 那一邊沒有數值可比，所以整條列成差異，讓人去看
  const onlyOneSide = [...(a.props ?? []).filter(prop => !(b.props ?? []).includes(prop)).map(prop => `-${prop}`),
    ...(b.props ?? []).filter(prop => !(a.props ?? []).includes(prop)).map(prop => `+${prop}`)]
  if (onlyOneSide.length) lines.push(`${name}｜只在一邊量到的屬性：${onlyOneSide.join(' ')}`)
  for (const key of [...new Set([...Object.keys(a.elements), ...Object.keys(b.elements)])]) {
    const x = a.elements[key]
    const y = b.elements[key]
    if (!x || !y) { lines.push(`${name}｜${key}｜元素只在${x ? '前' : '後'}面`); continue }
    for (const prop of Object.keys(x)) {
      if (prop === 'class' || !(prop in y) || x[prop] === y[prop]) continue
      const cls = (y.class || x.class).trim()
      lines.push(`${name}｜${key}${cls ? ` (.${cls.split(/\s+/).join('.')})` : ''}｜${prop}：${x[prop]} → ${y[prop]}`)
    }
  }
}
for (const line of lines) console.log(line)
console.log(lines.length ? `\n${lines.length} 個差異` : '0 個差異')
process.exit(lines.length ? 1 : 0)
