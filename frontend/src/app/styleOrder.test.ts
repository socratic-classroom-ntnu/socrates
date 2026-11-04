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

// 兩邊的樣式表都是全域的：同名的 class 會互相蓋掉（例如分組課出題表單與活動編輯器的題目順序面板）
test('course stylesheets share no class names with the group-class ones', () => {
  const course = new Set(COURSE.flatMap(sheet => [...classNames(sheet)]))
  const shared = GROUP_CLASS.flatMap(sheet => [...classNames(sheet)].filter(name => course.has(name)).map(name => `${sheet}: .${name}`))
  expect(shared).toEqual([])
})
