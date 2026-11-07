import fs from 'node:fs'
import path from 'node:path'

// CSS 照載入順序疊：同一個選擇器、同樣的權重，後載入的贏。jsdom 不套用 CSS，所以這裡照 ESM 的求值順序
// （深度優先、依 import 的先後）從 main.tsx 走一遍 import，算出瀏覽器實際載入樣式表的順序。
const SRC = path.resolve(__dirname, '..')
const IMPORT = /^\s*import\s+(type\s+)?(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm

function resolve(from: string, spec: string): string | null {
  const base = path.resolve(path.dirname(from), spec)
  for (const candidate of [base + '.ts', base + '.tsx', base + '.mjs', path.join(base, 'index.ts'), base]) {
    if (/\.(tsx?|mjs)$/.test(candidate) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

function stylesheetOrder(entry: string): string[] {
  const seen = new Set<string>()
  const sheets: string[] = []
  const walk = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    for (const [, typeOnly, spec] of fs.readFileSync(file, 'utf8').matchAll(IMPORT)) {
      if (typeOnly || !spec.startsWith('.')) continue
      if (spec.endsWith('.css')) {
        const sheet = path.relative(SRC, path.resolve(path.dirname(file), spec))
        if (!sheets.includes(sheet)) sheets.push(sheet)
        continue
      }
      const next = resolve(file, spec)
      if (next) walk(next)
    }
  }
  walk(path.join(SRC, entry))
  return sheets
}

// 分組課的樣式，照原本 ClassroomApp 載入的順序
const GROUP_CLASS = [
  'styles/entrance.css', 'styles/email-verification.css', 'features/avatar/tutor-avatar.css', 'shared/input/composer.css',
  'styles/research.css', 'features/classroom-answer/answerStage.css', 'styles/provider-settings.css', 'styles/group.css',
  'features/teacher-records/teacher-records.css', 'styles/script-builder.css', 'styles/question-bank.css',
  'styles/teacher-dashboard.css', 'features/question-bank/QuestionBank.css', 'features/danmaku/Danmaku.css',
  'features/student-classroom/WaitingRoom.css', 'features/group-dialogue/GroupResult.css', 'features/group-dialogue/PollResult.css',
  'features/authoring/activity-form/activity-form.css', 'styles/style.css', 'styles/design-library.css',
]
// 課程與外框的樣式，照搬來之前的順序。唯一的差別是 menu.css：以前 JoinLayout 從 AccountMenu 取 Avatar，
// 順帶在 join.css 前載入了 menu.css；Avatar 抽到 components/ 之後它排到 solo.css 後面。menu.css 只有 .menu*，
// 跟 join、learn、solo 沒有共用的 class，先後不影響畫面。
const COURSE = [
  'styles/placeholder-page.css', 'styles/ui.css', 'styles/dialog.css', 'styles/teach.css', 'styles/home.css',
  'styles/join.css', 'styles/learn.css', 'styles/solo.css', 'styles/menu.css', 'styles/teacher-live.css', 'styles/teacher-analysis.css',
  'styles/date-time-field.css', 'styles/editor.css', 'styles/auth.css', 'styles/app-shell.css',
]

// 棘輪失敗時，把「該怎麼做」接在 jest 的差異前面。這幾條組員新增樣式時也會碰到，訊息要讓人不必讀這支檔就知道怎麼處理
function withHint(hint: string, assertion: () => void): void {
  try {
    assertion()
  } catch (error) {
    if (error instanceof Error) error.message = `${hint}\n\n${error.message}`
    throw error
  }
}

const order = stylesheetOrder('main.tsx')
const among = (list: string[]) => order.filter(sheet => list.includes(sheet))

test('group-class stylesheets keep the order they had before the merge', () => {
  expect(among(GROUP_CLASS)).toEqual(GROUP_CLASS)
})

test('course and shell stylesheets keep the order they had before the merge', () => {
  expect(among(COURSE)).toEqual(COURSE)
})

// 搬來之前，分組課的全域樣式（style.css 等）都在課程頁之前載入，課程頁與外框的規則才蓋得過它們
test('group-class stylesheets load before the course and shell ones', () => {
  const lastGroup = Math.max(...GROUP_CLASS.map(sheet => order.indexOf(sheet)))
  const firstCourse = Math.min(...COURSE.map(sheet => order.indexOf(sheet)))
  expect(lastGroup).toBeLessThan(firstCourse)
})

function classNames(sheet: string): Set<string> {
  const css = fs.readFileSync(path.join(SRC, sheet), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const names = new Set<string>()
  for (const [, selector] of css.matchAll(/([^{}]+)\{/g)) {
    if (selector.trim().startsWith('@')) continue
    for (const [, name] of selector.matchAll(/\.([A-Za-z_][\w-]*)/g)) names.add(name)
  }
  return names
}

// ui.css 只放共用控制項；某一個元件（例如對話框）的樣式放它自己的樣式表，之後搬進 src/ui 時才拆得乾淨。
// 用 id 指定某一頁的元素也不行（沒有 class 的元素選擇器由 global selectors only shrink 擋）
const UI_CONTROL_BLOCKS = ['button', 'chip', 'chips', 'copy-button', 'form-error', 'form-field', 'icon-button', 'qr-code', 'status-pill']
test('ui.css only holds shared control classes', () => {
  const strays = [...classNames('styles/ui.css')].filter(name => !UI_CONTROL_BLOCKS.includes(name.replace(/(__|--).*$/, '')))
  const selectors = [...source('styles/ui.css').matchAll(/([^{}]+)\{/g)].map(([, selector]) => selector).filter(selector => !selector.trim().startsWith('@'))
  const ids = selectors.flatMap(selector => [...selector.replace(/(['"]).*?\1/g, '').matchAll(/#([A-Za-z_][\w-]*)/g)].map(([, name]) => `#${name}`))
  expect([...strays, ...ids].sort()).toEqual([])
})

// 兩邊的樣式表都是全域的：同名的 class 會互相蓋掉（例如分組課出題表單與活動編輯器的題目順序面板）
test('course stylesheets share no class names with the group-class ones', () => {
  const course = new Set(COURSE.flatMap(sheet => [...classNames(sheet)]))
  const shared = GROUP_CLASS.flatMap(sheet => [...classNames(sheet)].filter(name => course.has(name)).map(name => `${sheet}: .${name}`))
  expect(shared).toEqual([])
})

// 全站層級的樣式。responsive.css 不在 JS 的 import 圖裡，只靠 styles.css 的 @import 載入，位置跟 styles.css 一起
const GLOBAL = ['styles/dev-console.css', 'styles.css', 'styles/responsive.css']

test('global stylesheets load last', () => {
  expect(among(GLOBAL)).toEqual(['styles/dev-console.css', 'styles.css'])
  expect(order.slice(-2)).toEqual(['styles/dev-console.css', 'styles.css'])
})

// 元件庫的樣式：token 先於一切（Task 7 加 ui/base.css、Task 8 加 ui/layers.css）
const UI = ['ui/tokens.css']

// --ui-* 只是自訂屬性，放哪裡都不會蓋到別人；放第一個是為了讓「token 先於一切」好懂
test('tokens load first', () => {
  expect(order[0]).toBe('ui/tokens.css')
})

function allStylesheets(dir = SRC): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return allStylesheets(full)
    return entry.name.endsWith('.css') ? [path.relative(SRC, full)] : []
  })
}

// 這四組是棘輪：新的全域樣式表會讓這條紅。優先改用 CSS Modules；確定要全域，就登記到所屬的組，review 時看得到
test('every stylesheet belongs to exactly one group', () => {
  const groups = [...UI, ...GROUP_CLASS, ...COURSE, ...GLOBAL]
  expect(new Set(groups).size).toBe(groups.length)
  const sheets = allStylesheets().filter(sheet => !sheet.endsWith('.module.css'))
  withHint('新增或刪除了全域樣式表。新的樣式優先寫成 *.module.css（不受這條限制）；確定要全域樣式表，就把它加進所屬的組'
    + '（UI、GROUP_CLASS、COURSE、GLOBAL），位置照 main.tsx 的載入順序。刪掉的檔也從組裡拿掉。',
  () => expect(sheets.sort()).toEqual([...groups].sort()))
})

test('ui and global stylesheets share no class names with the course ones', () => {
  const course = new Set(COURSE.flatMap(sheet => [...classNames(sheet)]))
  const shared = [...UI, ...GLOBAL].flatMap(sheet => [...classNames(sheet)].filter(name => course.has(name)).map(name => `${sheet}: .${name}`))
  expect(shared).toEqual([])
})

// 去掉 BOM 與註解：註解裡的字不是樣式
function source(sheet: string): string {
  return fs.readFileSync(path.join(SRC, sheet), 'utf8').replace(/^\uFEFF/, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

// 再清空 url(…) 的內容：url 裡的 { 、; 也不是樣式
function stripped(sheet: string): string {
  return source(sheet).replace(/url\([^)]*\)/g, 'url()')
}

// 本地 @import 會在每個 import 它的樣式表裡各展開一份，順序測試看不到這幾份（ui.css 就是這樣蓋掉頁面覆寫的）。
// 引號和 url(…) 兩種寫法都算，at-rule 名稱不分大小寫，@import 後面可以沒有空白（@import"x.css"）；http(s):// 與 // 開頭的外部字型不算
// 只認陳述開頭（檔首或 ; { } 之後）的 @import：content: "@import …" 的字串不算；data: URL 的內容先清空
const IMPORT_AT_RULE = /(?:^|[;{}])\s*@import\s*(?:url\(\s*)?['"]?([^'")\s;]+)/gi
test('local @import only where allowed', () => {
  const imports = allStylesheets().flatMap(sheet => [...source(sheet).replace(/url\(\s*['"]?data:[^)]*\)/gi, 'url()').matchAll(IMPORT_AT_RULE)]
    .map(([, spec]) => spec)
    .filter(spec => !/^(https?:)?\/\//i.test(spec))
    .map(spec => `${sheet} -> ${path.relative(SRC, path.resolve(path.dirname(path.join(SRC, sheet)), spec))}`))
  withHint('本地 @import 有增減。@import 會在每個引用它的樣式表各展開一份，載入順序測試看不到，可能蓋掉頁面的覆寫；'
    + '請改在 JS 裡 import。確定要用，就加進這條的清單。',
  () => expect(imports.sort()).toEqual([
    'styles.css -> styles/responsive.css',
  ]))
})

// 頂層逗號切開選擇器；括號裡的逗號（:is(a, b)）不切
function splitTopLevel(text: string, separators: RegExp): string[] {
  const parts: string[] = []
  let depth = 0, current = ''
  for (const char of text) {
    if (char === '(' || char === '[') depth++
    if (char === ')' || char === ']') depth--
    if (depth === 0 && separators.test(char)) { parts.push(current); current = ''; continue }
    current += char
  }
  return [...parts, current]
}

// 第一個 compound（第一個組合子之前）沒有 . 或 # 的選擇器，會套到所有頁面，例如 :root、body、button:disabled。
// 屬性值裡的 # 和 . 不算（[data-url="#a"]）。函式型偽類由內而外處理：
// :not(.x) 不算限縮（:not(.legacy-scope) 幾乎全站生效）；:is()／:where()／:has() 要每個分支都限縮才算
// （:is(.a, body) 的 body 分支是全域；:root:where(:has(.legacy-scope)) 只在舊頁生效）；
// 其他函式型偽類（:nth-child(2)、:lang(en)）不限縮，直接拿掉，外層的 :is() 才化簡得下去。
// 只認 class 與 id：[data-x] 開頭的選擇器照樣列進快照
function scopesByClassOrId(compound: string): boolean {
  let rest = compound.replace(/\[[^\]]*\]/g, '[]')
  for (let match = /:([\w-]+)\(([^()]*)\)/.exec(rest); match; match = /:([\w-]+)\(([^()]*)\)/.exec(rest)) {
    const [whole, name, args] = match
    const scoped = ['is', 'where', 'matches', 'has'].includes(name) && args.split(',').every(branch => /[.#]/.test(branch))
    rest = rest.replace(whole, scoped ? '.scoped' : '')
  }
  return /[.#]/.test(rest)
}

function globalSelectors(sheet: string): string[] {
  let css = stripped(sheet)
  // @keyframes 裡的 from、to、50% 不是選擇器：整段拿掉（大括號配對）
  for (let start = css.search(/@(-webkit-)?keyframes\b/); start >= 0; start = css.search(/@(-webkit-)?keyframes\b/)) {
    let depth = 0, end = css.indexOf('{', start)
    for (; end < css.length; end++) {
      if (css[end] === '{') depth++
      if (css[end] === '}' && --depth === 0) break
    }
    css = css.slice(0, start) + css.slice(end + 1)
  }
  const selectors: string[] = []
  for (const [, prelude] of css.matchAll(/([^{};]+)\{/g)) {
    if (prelude.trim().startsWith('@')) continue
    for (const selector of splitTopLevel(prelude, /,/).map(part => part.trim().replace(/\s+/g, ' '))) {
      const first = splitTopLevel(selector, /[\s>+~]/)[0]
      if (!scopesByClassOrId(first)) selectors.push(selector)
    }
  }
  return selectors
}

// 快照只能縮小：要加全域選擇器就得改這裡，review 時一定會被看到。照檔案裡出現的順序，重複的也列
const GLOBAL_SELECTORS: Record<string, string[]> = {
  'features/authoring/activity-form/activity-form.css': [
    '[data-closing] .order-panel', '[data-closing] .picker-panel', '[data-closing] .order-panel', '[data-closing] .picker-panel',
  ],
  'styles.css': [':root', '*', 'body', 'button', 'input', 'textarea', 'button', 'a', 'button:disabled', ':focus-visible', '::selection'],
  'styles/responsive.css': [':root', '*', '*::before', '*::after', 'textarea::placeholder'],
  'styles/solo.css': ["[data-option='A']", "[data-option='B']", "[data-option='C']", "[data-option='D']"],
  'styles/style.css': [':root', 'body', '[class^=sc-]', '[class*=" sc-"]', '*', '*::before', '*::after', '*', '*::before', '*::after'],
  'ui/tokens.css': [':root'],
}

test('global selectors only shrink', () => {
  const found = Object.fromEntries(allStylesheets().map(sheet => [sheet, globalSelectors(sheet)]).filter(([, selectors]) => selectors.length))
  withHint('全域選擇器（沒有 class 或 id 限縮，會套到每一頁）有增減。不是有意的，就在選擇器前面加上頁面或元件的 class；'
    + '確定要新增，就把它加進 GLOBAL_SELECTORS 快照，review 時會被看到。刪掉的選擇器也從快照拿掉。',
  () => expect(found).toEqual(GLOBAL_SELECTORS))
})

// token 只在一個地方定義，頁面與元件只能引用
test('--ui-* custom properties are defined only in src/ui/tokens.css', () => {
  const definers = allStylesheets().filter(sheet => /--ui-[\w-]+\s*:/.test(stripped(sheet)))
  expect(definers.filter(sheet => sheet !== 'ui/tokens.css')).toEqual([])
})

// 課程檔的色碼（D9：只管 COURSE）。先去掉註解與 url(…) 再算（D11）；#abc 視同 #AABBCC，大小寫不分
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})\b/gi
const normalizeHex = (hex: string) => (hex.length === 4 ? `#${[...hex.slice(1)].map(digit => digit + digit).join('')}` : hex).toUpperCase()
// 只看宣告的值：先拿掉每個 { 前面的選擇器與 at-rule 條件（CSS nesting 的外層宣告也保留），再拿掉字串。
// 選擇器裡的 #fff、[href="#fff"] 不是顏色
const hexesIn = (sheet: string) => [...stripped(sheet).replace(/[^{};]*\{/g, '{').replace(/(['"])(?:(?!\1).)*\1/g, '""').matchAll(HEX)]
  .map(([hex]) => hex)

// tokens.css 已有的顏色就不該再寫死：一個色碼只對一個 token，換成 var(--ui-color-*) 不改外觀
test('course sheets: palette colors are referenced through tokens', () => {
  const palette = new Set([...source('ui/tokens.css').matchAll(/--ui-color-[\w-]+\s*:\s*(#[0-9a-f]+)/gi)].map(([, hex]) => normalizeHex(hex)))
  const literal = COURSE.flatMap(sheet => hexesIn(sheet).filter(hex => palette.has(normalizeHex(hex))).map(hex => `${sheet}: ${hex}`))
  withHint('tokens.css 已經有這個顏色，請改用對應的 var(--ui-color-*)；要用新的顏色，先在 src/ui/tokens.css 加 token。',
    () => expect(literal).toEqual([]))
})

// 棘輪：課程檔寫死的色碼只能變少。數量變少時把常數改成新的數字；某個顏色整個不見了，也從清單拿掉。
// 只看數量擋不住「刪一個舊色、加一個新色」，所以另外列出現有的顏色：清單外的新顏色要先加進 tokens.css
const COURSE_RAW_HEX = 283
const COURSE_RAW_COLORS = [
  '#1E1C18', '#1E6B60', '#1F3A31', '#24493C', '#285344', '#2A2723', '#2C3F37', '#2E8B57', '#2F4A3F', '#31526B',
  '#3A362F', '#3A4B43', '#3F3424', '#4A3A0E', '#4A3A2C', '#4B514D', '#4E3824', '#57514A', '#594C3B', '#5A4129',
  '#5A432D', '#5E432B', '#5E655F', '#675A1D', '#684B20', '#6A4D33', '#6A706C', '#6B4E0E', '#6C665F', '#6E4520',
  '#6E5034', '#77716A', '#7A5A1E', '#7A5A3C', '#7FCB9B', '#8A572E', '#8A8F8B', '#8A908C', '#8C8578', '#8F8678',
  '#9A958B', '#A3322C', '#A3A8A4', '#A83C15', '#A99E8A', '#A9B5AE', '#B5B9B5', '#B7CBC1', '#B8B2A5', '#B8BBB8',
  '#C4501F', '#C9A24A', '#C9C2B1', '#C9C2B2', '#C9C4B8', '#C9CCC9', '#CFE0D6', '#D2C8B8', '#D5A64C', '#D8E7F1',
  '#D9A22E', '#D9D3C6', '#DCE9E2', '#DDD5C6', '#DDE4E0', '#DDE6E1', '#E4EFF6', '#E5F0EA', '#E8573A', '#E8C46A',
  '#E8D5A9', '#E9B7AC', '#E9E4DA', '#E9E6DF', '#E9E9E4', '#EAF0F5', '#ECE4D3', '#ECE6DA', '#ECE6DC', '#ECECE8',
  '#EDF2EF', '#EEF2EF', '#EEF4FA', '#EFEBE0', '#EFEDE7', '#F0F0EC', '#F0F1EF', '#F1DDA9', '#F3D4AD', '#F3DFA8',
  '#F3EEE3', '#F3F2EE', '#F4F0E8', '#F4F0E9', '#F5E7A8', '#F6E3A8', '#F6E3D8', '#F7F5F0', '#F7F6F2', '#F8F6F1',
  '#F9F9F7', '#FAFAF8', '#FFF1CF', '#FFF6E0', '#FFF9E9', '#FFF9EC', '#FFFCF3', '#FFFDF8',
]
test('course sheets: raw hex count only shrinks', () => {
  const found = COURSE.flatMap(hexesIn)
  const colors = [...new Set(found.map(normalizeHex))].sort()
  withHint('課程檔出現清單外的新顏色，或某個顏色已經不再使用。新顏色請先加進 src/ui/tokens.css 再引用；'
    + '不再使用的顏色，從 COURSE_RAW_COLORS 拿掉。',
  () => expect(colors).toEqual(COURSE_RAW_COLORS))
  withHint(`課程檔寫死的色碼現在有 ${found.length} 個，棘輪是 ${COURSE_RAW_HEX}。新顏色請先加進 src/ui/tokens.css 再引用；`
    + '數量變少了，就把 COURSE_RAW_HEX 改成新的數字。',
  () => expect(found.length).toBe(COURSE_RAW_HEX))
})
