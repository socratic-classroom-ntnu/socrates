import fs from 'node:fs'
import path from 'node:path'
import * as ui from '.'

// 元件使用規範（給 AI 與組員讀）要跟 index.ts 的 export 同步：表格第一欄列的元件名稱 = 大寫開頭的 export
const GUIDE = path.resolve(__dirname, '../../../docs/modules/frontend/ui-components.md')

test('ui-components.md lists every exported component', () => {
  const listed = [...fs.readFileSync(GUIDE, 'utf8').matchAll(/^\| `([A-Z]\w*)` \|/gm)].map(([, name]) => name)
  const exported = Object.keys(ui).filter(name => /^[A-Z]/.test(name))
  expect([...listed].sort()).toEqual(exported.sort())
})
