import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { ApiError, getPublicConfig, getRelease, recentApiErrors, RECENT_API_ERROR_LIMIT, subscribeApiErrors } from '../../api/classroomClient'
import { devAccount, devViews, subscribeDevConsole } from './devConsoleStore'
import '../../styles/dev-console.css'

// 開發控制台：只在後端 /public-config 的 debug_mode 為 true 時出現。
// 功能待產品決定，現在只放已經存在的真實資料：版本、登入帳號、路由、最近的 API 錯誤、目前教室畫面的原始資料。
// debug_mode 為 false 或沒有這個欄位時什麼都不畫，也不再發任何請求。

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

export function DevConsole() {
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)
  const toggle = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let live = true
    Promise.resolve(getPublicConfig())
      .then(config => { if (live && config?.debug_mode === true) setEnabled(true) })
      .catch(() => undefined)
    return () => { live = false }
  }, [])

  if (!enabled) return null
  return <>
    <button ref={toggle} type="button" className="dev-console-toggle" aria-expanded={open} aria-controls="dev-console" onClick={() => setOpen(value => !value)}>開發控制台</button>
    {open && <DevConsoleDrawer onClose={() => { setOpen(false); toggle.current?.focus() }}/>}
  </>
}

function subscribeLocation(listener: () => void) {
  window.addEventListener('popstate', listener)
  window.addEventListener('hashchange', listener)
  return () => {
    window.removeEventListener('popstate', listener)
    window.removeEventListener('hashchange', listener)
  }
}
const currentLocation = () => `${location.pathname}${location.search}${location.hash}`

type Release = { state: 'loading' } | { state: 'ok'; source_sha: string; environment: string } | { state: 'error'; text: string }

function useRelease(): Release {
  const [release, setRelease] = useState<Release>({ state: 'loading' })
  useEffect(() => {
    let live = true
    getRelease()
      .then(data => { if (live) setRelease({ state: 'ok', source_sha: String(data?.source_sha ?? ''), environment: String(data?.environment ?? '') }) })
      .catch(error => {
        if (live) setRelease({ state: 'error', text: error instanceof ApiError ? `${error.message}（HTTP ${error.status}）` : String(error) })
      })
    return () => { live = false }
  }, [])
  return release
}

const show = (value: unknown) => (value === null || value === undefined ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value))
function Row({ name, value }: { name: string; value: string }) {
  return <div><dt>{name}</dt><dd>{value}</dd></div>
}
const clock = (at: number) => new Date(at).toLocaleTimeString('zh-TW', { hour12: false })

function DevConsoleDrawer({ onClose }: { onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  const close = useRef<HTMLButtonElement>(null)
  const errors = useSyncExternalStore(subscribeApiErrors, recentApiErrors)
  const views = useSyncExternalStore(subscribeDevConsole, devViews)
  const account = useSyncExternalStore(subscribeDevConsole, devAccount)
  const here = useSyncExternalStore(subscribeLocation, currentLocation)
  const release = useRelease()
  const url = new URL(here, 'http://local.invalid')
  const query = [...url.searchParams.entries()]
  // CSRF token 不顯示：它是這個分頁的憑證，不是除錯資訊。
  const accountRows = account && typeof account === 'object' ? Object.entries(account).filter(([key]) => key !== 'csrf_token') : []
  const viewEntries = Object.entries(views)

  useEffect(() => { close.current?.focus() }, [])

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !panel.current) return
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (!items.length) return
    const first = items[0], last = items[items.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }

  return <div className="dev-console">
    <div className="dev-console-backdrop" aria-hidden="true" onClick={onClose}/>
    <div ref={panel} id="dev-console" className="dev-console-panel" role="dialog" aria-modal="true" aria-labelledby="dev-console-title" onKeyDown={onKeyDown}>
      <header className="dev-console-head">
        <h2 id="dev-console-title">開發控制台（只在開發模式出現）</h2>
        <button ref={close} type="button" className="dev-console-close" aria-label="關閉開發控制台" onClick={onClose}>Esc</button>
      </header>
      <div className="dev-console-body">
        <section aria-labelledby="dev-console-release">
          <h3 id="dev-console-release">版本</h3>
          {release.state === 'loading' && <p className="dev-console-muted">讀取中…</p>}
          {release.state === 'error' && <p className="dev-console-error">讀不到版本資訊：{release.text}</p>}
          {release.state === 'ok' && <dl className="dev-console-kv"><Row name="source_sha" value={release.source_sha}/><Row name="environment" value={release.environment}/></dl>}
        </section>
        <section aria-labelledby="dev-console-account">
          <h3 id="dev-console-account">目前登入帳號</h3>
          {accountRows.length
            ? <dl className="dev-console-kv">{accountRows.map(([key, value]) => <Row key={key} name={key} value={show(value)}/>)}</dl>
            : <p className="dev-console-muted">這個畫面沒有讀取登入帳號。</p>}
        </section>
        <section aria-labelledby="dev-console-route">
          <h3 id="dev-console-route">目前頁面路由與 query</h3>
          <dl className="dev-console-kv">
            <Row name="path" value={url.pathname}/>
            {query.map(([key, value], i) => <Row key={`${key}:${i}`} name={`?${key}`} value={value}/>)}
            {url.hash && <Row name="hash" value={url.hash}/>}
          </dl>
        </section>
        <section aria-labelledby="dev-console-errors">
          <h3 id="dev-console-errors">最近的 API 錯誤 <small>{errors.length} / {RECENT_API_ERROR_LIMIT}</small></h3>
          {errors.length
            ? <ol className="dev-console-errors" aria-label="最近的 API 錯誤列表">{errors.map((error, i) => <li key={`${error.at}:${i}`}>
              <time>{clock(error.at)}</time>
              <span className="dev-console-status">{error.status || '—'}</span>
              <span className="dev-console-request">{[error.method, error.path].filter(Boolean).join(' ') || '（沒有請求資訊）'}</span>
              {error.code && <code>{error.code}</code>}
            </li>)}</ol>
            : <p className="dev-console-muted">目前沒有 API 錯誤。</p>}
        </section>
        <section aria-labelledby="dev-console-view">
          <h3 id="dev-console-view">目前教室畫面原始資料</h3>
          {viewEntries.length
            ? viewEntries.map(([source, data]) => <details key={source}><summary>{source}</summary><pre aria-label={`${source} 原始資料`}>{JSON.stringify(data, null, 2)}</pre></details>)
            : <p className="dev-console-muted">目前沒有掛載教室畫面。</p>}
        </section>
      </div>
      <footer className="dev-console-foot">功能待訂</footer>
    </div>
  </div>
}
