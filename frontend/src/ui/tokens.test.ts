import fs from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(__dirname, '..')
const TOKENS = path.join(__dirname, 'tokens.css')

function filesUnder(dir: string, pattern: RegExp): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return filesUnder(full, pattern)
    return pattern.test(entry.name) ? [full] : []
  })
}

const withoutComments = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '')

function definedTokens(): Set<string> {
  return new Set([...withoutComments(fs.readFileSync(TOKENS, 'utf8')).matchAll(/(--ui-[\w-]+)\s*:/g)].map(([, name]) => name))
}

// 樣式表、TSX 的 inline style 都算：引用了沒定義的 token，瀏覽器會靜默退回初始值。測試檔不算（訊息裡會提到 token 名稱）
test('every var(--ui-*) used in src is defined in tokens.css', () => {
  const defined = definedTokens()
  const missing = filesUnder(SRC, /\.(css|tsx?)$/).filter(file => !/\.test\.tsx?$/.test(file)).flatMap(file =>
    [...withoutComments(fs.readFileSync(file, 'utf8')).matchAll(/var\(\s*(--ui-[\w-]+)/g)]
      .map(([, name]) => name)
      .filter(name => !defined.has(name))
      .map(name => `${path.relative(SRC, file)}: ${name}`))
  expect(missing).toEqual([])
})

// tokens.css 只有一條 :root，裡面只有 --ui-* 宣告；元件樣式放各自的 module
test('tokens.css only defines custom properties on :root', () => {
  const css = withoutComments(fs.readFileSync(TOKENS, 'utf8'))
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }))
  expect(rules.map(rule => rule.selector)).toEqual([':root'])
  const declarations = rules[0].body.split(';').map(part => part.trim()).filter(Boolean)
  expect(declarations.filter(declaration => !/^--ui-[\w-]+\s*:/.test(declaration))).toEqual([])
  expect(declarations.length).toBeGreaterThan(0)
})

// token 只在 tokens.css 定義：TSX 的 inline style（{ '--ui-color-panel': … }、{ ['--ui-color-panel']: … }）或 setProperty('--ui-…') 也算重新定義，
// 會讓那一塊畫面的 token 變成別的顏色。樣式表那一半由 styleOrder.test.ts 的 --ui-* 定義檢查負責
test('no script sets a --ui-* custom property', () => {
  const setters = filesUnder(SRC, /\.(tsx?|mjs)$/).filter(file => !/\.test\.tsx?$/.test(file)).flatMap(file =>
    [...withoutComments(fs.readFileSync(file, 'utf8')).matchAll(/(['"`])(--ui-[\w-]+)\1\]?\s*:|setProperty\(\s*(['"`])(--ui-[\w-]+)\3/g)]
      .map(match => `${path.relative(SRC, file)}: ${match[2] ?? match[4]}`))
  expect(setters).toEqual([])
})
