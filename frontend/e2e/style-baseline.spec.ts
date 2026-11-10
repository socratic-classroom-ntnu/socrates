// computed style 基準：逐頁收集每個可見元素的一組樣式屬性，寫成 JSON，給 compare-style.mjs 比對前後差異。
// 用法見 docs/superpowers/plans/2026-11-03-frontend-style-unification.md Task 2：
//   BASELINE=before npx playwright test   →  e2e/.baseline/before/<build|dev>/<頁面>@<寬度>.json
// API 一律回 fixtures/api.ts 的固定資料，外部網路（字型）一律擋掉，時鐘固定在 NOW，動畫與轉場關掉。
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import { NOW, classroomRoutes } from './fixtures/api'

type Auth = 'signedIn' | 'signedOut' | 'unverified'
// open 在哪些寬度打開；沒寫就是每個寬度都開
type Surface = { name: string; url: string; auth?: Auth; open?: (page: Page) => Promise<void>; openAt?: number[] }

const SURFACES: Surface[] = [
  // 課程與外框
  { name: 'login', url: '/login', auth: 'signedOut' },
  { name: 'verify', url: '/verify', auth: 'unverified' },
  { name: 'home-learn', url: '/' },
  { name: 'home-teach', url: '/?tab=teach' },
  { name: 'join-course', url: '/join?code=3CKTGE7Q' },
  { name: 'join-activity', url: '/activities/a-open/join' },
  { name: 'learn-course', url: '/learn/courses/c-1' },
  { name: 'learn-activity', url: '/learn/activities/a-open' },
  { name: 'learn-dialogue', url: '/learn/activities/a-open/dialogue' },
  { name: 'teach-course', url: '/teach/courses/c-1' },
  { name: 'teach-editor', url: '/teach/activities/a-draft/edit' },
  { name: 'teach-live', url: '/teach/activities/a-open' },
  { name: 'teach-analysis', url: '/teach/activities/a-ended/analysis' },
  // 教師端在 375 只顯示請改用電腦的插圖，沒有邀請按鈕
  { name: 'invite-dialog', url: '/teach/courses/c-1', open: page => page.getByRole('button', { name: '邀請學生' }).click(), openAt: [1280] },
  { name: 'account-menu', url: '/', open: page => page.getByRole('button', { name: '帳號選單' }).first().click() },
  // 分組課（/classrooms/:id 要 WebSocket 的教室狀態，等 PR D 再補）
  { name: 'groups', url: '/groups' },
  { name: 'teacher-home', url: '/teacher/home' },
  { name: 'teacher-course', url: '/teacher/courses/c-1' },
  { name: 'demo-question-bank', url: '/question-bank' },
  { name: 'demo-danmaku', url: '/danmaku' },
  { name: 'demo-waiting-room', url: '/waiting-room' },
  { name: 'demo-group-result', url: '/group-result' },
  { name: 'demo-poll-result', url: '/poll-result' },
  { name: 'demo-activity-form', url: '/activity-form' },
]

const WIDTHS = [1280, 375]

// 長寫屬性：簡寫在 getComputedStyle 裡不一定有值
const SIDES = ['top', 'right', 'bottom', 'left']
const PROPS = [
  // 顏色與外觀
  'color', 'background-color', 'background-image', 'color-scheme', 'opacity', 'visibility', 'box-shadow', 'fill', 'stroke', 'cursor', 'content',
  // 版面
  'display', 'position', ...SIDES, 'z-index', 'box-sizing', 'width', 'min-width', 'max-width', 'height', 'min-height', 'max-height',
  'overflow-x', 'overflow-y', 'transform', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis', 'order',
  'align-items', 'align-self', 'justify-content', 'row-gap', 'column-gap', 'grid-template-columns', 'grid-template-rows',
  'grid-column-start', 'grid-column-end', 'grid-row-start', 'grid-row-end',
  // 文字
  'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing', 'text-align', 'text-transform',
  'text-decoration-line', 'text-decoration-color', 'white-space', 'overflow-wrap', 'text-overflow', 'vertical-align', 'list-style-type',
  // 方框
  ...SIDES.flatMap(side => [`padding-${side}`, `margin-${side}`, `border-${side}-width`, `border-${side}-style`, `border-${side}-color`]),
  'border-top-left-radius', 'border-top-right-radius', 'border-bottom-right-radius', 'border-bottom-left-radius',
  'outline-color', 'outline-style', 'outline-width', 'outline-offset',
]

// 除了上面這組，生效中的樣式規則宣告過的長寫屬性也都量（declaredProperties），新寫的屬性不會漏。
// 動畫與轉場已經被 FREEZE 關掉，自訂屬性不是畫面本身，都不量
const SKIPPED_PROPERTY = /^(--|animation|transition|will-change)/
// ::selection 只量這幾個（只有它們會作用在選取的文字上）
const SELECTION_PROPS = ['color', 'background-color', 'text-shadow', 'text-decoration-line']

// 互動狀態：樣式表裡寫到這些狀態的元素，會用 CDP 強制進入該狀態再量一次
const STATES = ['hover', 'focus', 'focus-visible', 'focus-within', 'active']

const FREEZE = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }'

async function mockNetwork(page: Page, auth: Auth, unmocked: string[]) {
  const routes = classroomRoutes({ signedIn: auth !== 'signedOut', verified: auth !== 'unverified' })
  const origin = new URL(test.info().project.use.baseURL!).origin
  await page.routeWebSocket(/\/api\//, () => {}) // 不連到伺服器、也不送訊息：教室畫面停在初始狀態
  await page.route('**/*', async route => {
    const url = new URL(route.request().url())
    if (url.origin !== origin) return route.abort()
    if (!url.pathname.startsWith('/api/')) return route.continue()
    const key = `${route.request().method()} ${url.pathname.replace(/^\/api\/v2/, '')}${url.search}`
    if (key in routes) return route.fulfill({ json: routes[key] })
    if (key === 'GET /auth/me') return route.fulfill({ status: 401, json: { detail: 'not authenticated' } })
    unmocked.push(key)
    return route.fulfill({ status: 404, json: { detail: 'not in style baseline fixtures' } })
  })
}

// 在頁面裡跑：走過所有「目前生效」的樣式規則。@media、@supports 條件不成立的整段跳過（不然刪掉一條從未生效的
// 規則也會被當成差異）；擋掉的外部字型表讀不到 cssRules，也跳過。
// page.evaluate 只送單一函式進頁面，所以這支用 addInitScript 掛成 window.__activeStyleRules，其他函式從 window 取用
function activeStyleRules(): CSSStyleRule[] {
  const rules: CSSStyleRule[] = []
  const walk = (list: CSSRuleList) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSStyleRule) rules.push(rule)
      else if (rule instanceof CSSMediaRule && !matchMedia(rule.conditionText).matches) continue
      else if (rule instanceof CSSSupportsRule && !CSS.supports(rule.conditionText)) continue
      else if ('cssRules' in rule) walk((rule as CSSGroupingRule).cssRules)
    }
  }
  for (const sheet of Array.from(document.styleSheets)) {
    try { walk(sheet.cssRules) } catch { /* 外部字型表 */ }
  }
  return rules
}

// 在頁面裡跑：固定清單＋生效規則宣告過的長寫屬性
function declaredProperties({ base, skipped }: { base: string[]; skipped: string }) {
  const skip = new RegExp(skipped)
  const props = new Set(base)
  const rules = (window as unknown as { __activeStyleRules: () => CSSStyleRule[] }).__activeStyleRules()
  for (const rule of rules) for (const prop of Array.from(rule.style)) if (!skip.test(prop)) props.add(prop)
  return [...props].sort()
}

// 在頁面裡跑：key 是不含 class 的 DOM 路徑（之後 CSS Modules 換掉 class 名稱，key 也不變），跳過 display: contents 的祖先，
// class 另外記著給人看。
// 偽元素各自多一筆，key 後面接偽元素名稱：有 content 的 ::before／::after、有 placeholder 的輸入框的 ::placeholder、
// 直接含文字的元素的 ::selection（只量 SELECTION_PROPS）。
// 有 probe 時是強制狀態的量法：只量 data-style-probe=probe 的元素；scope 是 subtree 時連同子孫，parent 時量它的父元素整棵
// （.trigger:hover + .panel 改的是兄弟）。key 是「被強制的元素{:狀態}」接上被量元素的相對路徑
function collect({ props, selectionProps, probe, states, scope }: { props: string[]; selectionProps: string[]; probe?: string; states?: string; scope?: string }) {
  // display: contents 的元素不算進路徑：它沒有方框，只是包裝（舊頁外面的 .legacy-scope），多包一層不該讓底下每個 key 都變。
  // 同名序號在「攤平包裝之後」的兄弟之間算：join.css 的 .join-plaque__rows div 是並排的好幾個包裝，
  // 只跳過不攤平的話，每個 div 裡的 dt 都是 dt:1，key 會互相蓋掉
  const wrapper = new Map<Element, boolean>()
  const isWrapper = (node: Element) => {
    if (!wrapper.has(node)) wrapper.set(node, getComputedStyle(node).display === 'contents')
    return wrapper.get(node)!
  }
  const flatIndex = new Map<Element, number>()
  const indexOf = (node: Element) => {
    let parent = node.parentElement
    while (parent && isWrapper(parent)) parent = parent.parentElement
    if (!parent || isWrapper(node)) {
      let index = 1
      for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) if (sibling.tagName === node.tagName) index++
      return index
    }
    if (!flatIndex.has(node)) {
      const counts = new Map<string, number>()
      const walk = (box: Element) => {
        for (const child of Array.from(box.children)) {
          if (isWrapper(child)) { walk(child); continue }
          counts.set(child.tagName, (counts.get(child.tagName) ?? 0) + 1)
          flatIndex.set(child, counts.get(child.tagName)!)
        }
      }
      walk(parent)
    }
    return flatIndex.get(node)!
  }
  const key = (el: Element) => {
    const parts: string[] = []
    for (let node: Element | null = el; node; node = node.parentElement) {
      if (node !== el && isWrapper(node)) continue
      parts.unshift(`${node.tagName.toLowerCase()}:${indexOf(node)}`)
    }
    return parts.join('>')
  }
  const read = (el: Element, pseudo?: string, only = props) => {
    const style = getComputedStyle(el, pseudo)
    const entry: Record<string, string> = { class: el.getAttribute('class') ?? '' }
    for (const prop of only) entry[prop] = style.getPropertyValue(prop)
    return entry
  }
  const elements: Record<string, Record<string, string>> = {}
  const forced = probe ? document.querySelector(`[data-style-probe="${probe}"]`) : null
  const forcedKey = forced ? key(forced) : ''
  const label = (el: Element) => {
    if (!forced) return key(el)
    const own = key(el)
    return own.startsWith(forcedKey) ? `${forcedKey}{:${states}}${own.slice(forcedKey.length)}` : `${forcedKey}{:${states}}~${own}`
  }
  const measured = forced ? (scope === 'parent' && forced.parentElement ? forced.parentElement : forced) : null
  const all = measured ? [measured, ...(scope === 'self' ? [] : measured.querySelectorAll('*'))] : [document.documentElement, document.body, ...document.body.querySelectorAll('*')]
  for (const el of all) {
    if (el !== document.documentElement && el !== document.body && el.getClientRects().length === 0) continue
    const name = label(el)
    elements[name] = read(el)
    for (const pseudo of ['::before', '::after']) {
      const content = getComputedStyle(el, pseudo).getPropertyValue('content')
      if (content !== 'none' && content !== 'normal') elements[name + pseudo] = read(el, pseudo)
    }
    if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.placeholder) elements[name + '::placeholder'] = read(el, '::placeholder')
    if (Array.from(el.childNodes).some(node => node.nodeType === Node.TEXT_NODE && node.textContent!.trim())) elements[name + '::selection'] = read(el, '::selection', selectionProps)
  }
  return elements
}

// 在頁面裡跑：從生效中的樣式規則找出寫了 STATES 的選擇器。帶狀態的那個 compound 為止的部分（拿掉狀態與偽元素）
// 拿去 querySelectorAll，命中的元素標上 data-style-probe，同一個 compound 裡的狀態一起強制（button:hover:focus-visible）。
// 沒有其他條件的狀態（全域的 :focus-visible）只找可互動的元素，不然 html、body 每一層都會被強制一次。
// 狀態寫在括號裡（:is(a:hover)、:has(.x:hover)）、分在不同 compound（.parent:hover .child:focus）、接著清單外的偽元素
// （::-webkit-scrollbar-thumb:hover），或在 CSS nesting 裡，這支工具推不出目標，列進 unsupported，測試直接紅。
// 這是工具的限制，不是 CSS 的規範：遇到時擴充工具，不要改寫 CSS
function markStateTargets(states: string[]) {
  const INTERACTIVE = ':is(a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"])'
  const STATE = new RegExp(`:(${states.join('|')})(?![\\w-])`, 'g')
  const PSEUDO_ELEMENT = /::?(before|after|placeholder|marker|selection)(?![\w-])/g
  const strip = (text: string) => text.replace(STATE, '').replace(PSEUDO_ELEMENT, '')
  const RANK: Record<string, number> = { self: 0, subtree: 1, parent: 2 }
  const targets = new Map<Element, Map<string, string>>()
  const unsupported = new Set<string>()
  const rules = (window as unknown as { __activeStyleRules: () => CSSStyleRule[] }).__activeStyleRules()
  for (const rule of rules) {
    // CSS nesting（.a { &:hover { … } }）：dev server 原樣送出，這支工具只讀頂層規則，底下的狀態與屬性量不到。
    // build 會攤平，所以只有 dev 會紅；第一次遇到時擴充 activeStyleRules，不要為了工具拿掉 nesting
    if (rule.cssRules?.length) unsupported.add(`${rule.selectorText} { 巢狀規則 }`)
    const parts: string[] = []
    let depth = 0, current = ''
    for (const char of rule.selectorText) {
      if (char === '(' || char === '[') depth++
      if (char === ')' || char === ']') depth--
      if (depth === 0 && char === ',') { parts.push(current); current = ''; continue }
      current += char
    }
    parts.push(current)
    for (const selector of parts.map(part => part.trim())) {
      // 切成 compound：[開始, 結束) 與它後面的組合子
      const compounds: { start: number; end: number; next: string }[] = []
      depth = 0
      let start = 0
      for (let i = 0; i <= selector.length; i++) {
        const char = selector[i] ?? ' '
        if (char === '(' || char === '[') depth++
        if (char === ')' || char === ']') depth--
        if (depth !== 0) {
          if (char === ':' && new RegExp(`^:(${states.join('|')})(?![\\w-])`).test(selector.slice(i))) unsupported.add(selector)
          continue
        }
        if (/[\s>+~]/.test(char)) {
          if (i > start) {
            let j = i
            while (j < selector.length && /\s/.test(selector[j])) j++
            compounds.push({ start, end: i, next: /[>+~]/.test(selector[j] ?? '') ? selector[j] : (j < selector.length ? ' ' : '') })
          }
          start = i + 1
        }
      }
      // 每個 compound 括號外的狀態；括號裡的已經列進 unsupported
      const stateful = compounds.map(({ start: from, end, next }) => {
        const compound = selector.slice(from, end)
        const found: string[] = []
        let level = 0
        for (let i = 0; i < compound.length; i++) {
          if (compound[i] === '(' || compound[i] === '[') level++
          if (compound[i] === ')' || compound[i] === ']') level--
          const match = level === 0 && compound[i] === ':' ? new RegExp(`^:(${states.join('|')})(?![\\w-])`).exec(compound.slice(i)) : null
          if (match) found.push(match[1])
        }
        return { from, compound, next, found }
      }).filter(({ found }) => found.length)
      // 狀態分在不同 compound（.parent:hover .child:focus）要同時強制兩個元素，這支工具一次只強制一個，推不出來
      if (stateful.length > 1) { unsupported.add(selector); continue }
      for (const { from, compound, next, found } of stateful) {
        const combo = [...new Set(found)].sort().join('+')
        const scope = next === '+' || next === '~' ? 'parent' : next ? 'subtree' : 'self'
        const target = strip(selector.slice(0, from)) + (strip(compound).trim() || INTERACTIVE)
        let hits: Element[] = []
        // 清單外的偽元素（::-webkit-scrollbar-thumb:hover、:first-line）拿去 querySelectorAll 不會丟錯，只會選到 0 個，
        // 跟括號裡的狀態一樣推不出目標，列進 unsupported；選擇器本身不合法時也一樣
        if (/::|:first-(line|letter)(?![\w-])/.test(target)) { unsupported.add(selector); continue }
        try { hits = Array.from(document.querySelectorAll(target)) } catch { unsupported.add(selector); continue }
        for (const el of hits) {
          if (el.getClientRects().length === 0) continue
          if (!targets.has(el)) targets.set(el, new Map())
          const forced = targets.get(el)!
          if (RANK[scope] > RANK[forced.get(combo) ?? 'self'] || !forced.has(combo)) forced.set(combo, scope)
        }
      }
    }
  }
  const list = [...targets].map(([el, forced], index) => {
    el.setAttribute('data-style-probe', String(index))
    return { probe: String(index), combos: [...forced].sort(([a], [b]) => a.localeCompare(b)).map(([states, scope]) => ({ states, scope })) }
  })
  return { targets: list, unsupported: [...unsupported].sort() }
}

// DOM 連續 300ms 沒變動才算畫完（例如 QR code 是非同步產生的），最多等 3 秒；字型也要載完
function settle() {
  return document.fonts.ready.then(() => new Promise<void>(done => {
    let quiet = window.setTimeout(finish, 300)
    const limit = window.setTimeout(finish, 3_000)
    const observer = new MutationObserver(() => { window.clearTimeout(quiet); quiet = window.setTimeout(finish, 300) })
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true })
    function finish() { observer.disconnect(); window.clearTimeout(quiet); window.clearTimeout(limit); done() }
  }))
}

for (const surface of SURFACES) {
  test(surface.name, async ({ page }) => {
    const label = process.env.BASELINE ?? 'current'
    const out = path.join(path.dirname(fileURLToPath(import.meta.url)), '.baseline', label, test.info().project.name)
    fs.mkdirSync(out, { recursive: true })
    const unmocked: string[] = []
    const errors: string[] = []
    page.on('pageerror', error => errors.push(String(error)))
    await mockNetwork(page, surface.auth ?? 'signedIn', unmocked)
    await page.clock.setFixedTime(NOW)
    await page.addInitScript(`window.__activeStyleRules = ${activeStyleRules.toString()}`)
    const cdp = await page.context().newCDPSession(page)
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(surface.url, { waitUntil: 'networkidle' })
      await page.addStyleTag({ content: FREEZE })
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), undefined, { timeout: 5_000 }).catch(() => undefined)
      if (surface.open && (surface.openAt ?? WIDTHS).includes(width)) await surface.open(page)
      await page.evaluate(settle)
      const props = await page.evaluate(declaredProperties, { base: PROPS, skipped: SKIPPED_PROPERTY.source })
      const elements = await page.evaluate(collect, { props, selectionProps: SELECTION_PROPS })
      const { targets, unsupported } = await page.evaluate(markStateTargets, STATES)
      expect(unsupported, '基準工具還不支援這些寫法（狀態寫在括號裡、分在不同 compound、接著清單外偽元素，或 CSS nesting），推不出要量哪些元素。請擴充 markStateTargets／activeStyleRules；不要為了配合工具改寫 CSS').toEqual([])
      await cdp.send('DOM.enable')
      await cdp.send('CSS.enable')
      const { root } = await cdp.send('DOM.getDocument', { depth: -1 })
      for (const { probe, combos } of targets) {
        const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-style-probe="${probe}"]` })
        for (const { states, scope } of combos) {
          await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: states.split('+') })
          Object.assign(elements, await page.evaluate(collect, { props, selectionProps: SELECTION_PROPS, probe, states, scope }))
        }
        await cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] })
      }
      await cdp.send('CSS.disable')
      await cdp.send('DOM.disable')
      const result = { surface: surface.name, url: surface.url, width, props, path: new URL(page.url()).pathname + new URL(page.url()).search, unmocked: [...new Set(unmocked)].sort(), errors, elements }
      fs.writeFileSync(path.join(out, `${surface.name}@${width}.json`), JSON.stringify(result, null, 1))
      if (process.env.BASELINE_SCREENSHOTS) await page.screenshot({ path: path.join(out, `${surface.name}@${width}.png`), fullPage: true })
    }
  })
}
