import { useEffect, useRef, useState } from 'react'
import { getPublicConfig } from '../../api/classroomClient'
import { PackPresenter } from '../classroom-stage/avatar/packPresenter.mjs'
import { LANGS, speak } from './speech'
import './tutor-avatar.css'

// Socratic 與 CE 共用的導師人像：上半身取景、只有脖子以上會動、嘴型跟著語音。
// 模型清單在 /avatar-packs/catalog.json（每個 pack 標明可用的產品；CE 會商用，只列可商用的）。

export type AvatarProduct = 'socratic' | 'ce'
export type AvatarState = 'idle' | 'listening' | 'thinking' | 'speaking'
export type AvatarPack = {
  id: string
  name: string
  products?: string[]
  license?: string
  model_sha256: string
  [key: string]: unknown
}

const STATE_LABEL: Record<AvatarState, string> = {
  idle: '正在聆聽你的想法',
  listening: '語音輸入中',
  thinking: '正在思考你的觀點',
  speaking: '正在說話',
}

const read = (key: string) => { try { return window.localStorage.getItem(key) } catch { return null } }
const write = (key: string, value: string) => { try { window.localStorage.setItem(key, value) } catch { /* 無痕或封鎖儲存時只在本次有效 */ } }

/** 由 catalog 挑出這個產品可用的 pack；指定的 id 不可用時改用記住的選擇，再不行用第一個。 */
export function choosePack(packs: AvatarPack[], product: AvatarProduct, wanted?: string | null, remembered?: string | null) {
  const usable = packs.filter(p => !p.products || p.products.includes(product))
  return usable.find(p => p.id === wanted) ?? usable.find(p => p.id === remembered) ?? usable[0] ?? null
}

export async function loadCatalog(signal?: AbortSignal): Promise<AvatarPack[]> {
  const response = await fetch('/avatar-packs/catalog.json', { signal, credentials: 'same-origin' })
  if (!response.ok || !(response.headers.get('content-type') || '').includes('json')) throw Error('AVATAR_CATALOG_UNAVAILABLE')
  const catalog = await response.json()
  if (!Array.isArray(catalog?.packs)) throw Error('AVATAR_CATALOG_UNAVAILABLE')
  return catalog.packs
}

export function TutorAvatar({ product, state = 'idle', say, packId, label = '蘇格拉底導師', lang = 'zh' }: {
  product: AvatarProduct
  state?: AvatarState
  say?: { id: string; text: string } | null
  packId?: string | null
  label?: string
  lang?: keyof typeof LANGS
}) {
  const host = useRef<HTMLDivElement>(null)
  const presenter = useRef<PackPresenter | null>(null)
  const spoken = useRef<string | null>(null)
  const [packs, setPacks] = useState<AvatarPack[]>([])
  const [pack, setPack] = useState<AvatarPack | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'fallback'>('loading')
  const [talking, setTalking] = useState(false)
  const [voice, setVoice] = useState(() => read('avatar-voice') !== 'off')
  const [lab, setLab] = useState(false)
  const storeKey = `avatar-pack:${product}`

  useEffect(() => {
    let live = true
    Promise.resolve(getPublicConfig()).then(c => { if (live && c?.debug_mode === true) setLab(true) }).catch(() => undefined)
    return () => { live = false }
  }, [])

  useEffect(() => {
    const abort = new AbortController()
    loadCatalog(abort.signal).then(list => {
      setPacks(list)
      const chosen = choosePack(list, product, packId, read(storeKey))
      if (chosen) setPack(chosen)
      else setStatus('fallback')
    }).catch(() => { if (!abort.signal.aborted) setStatus('fallback') })
    return () => abort.abort()
  }, [product, packId, storeKey])

  useEffect(() => {
    if (!pack || !host.current) return
    let alive = true
    const current = new PackPresenter(host.current)
    presenter.current = current
    setStatus('loading')
    current.load(pack).then(() => { if (alive) setStatus('ready') }).catch(() => { if (alive) setStatus('fallback') })
    return () => { alive = false; presenter.current = null; void current.dispose() }
  }, [pack])

  useEffect(() => { presenter.current?.setMood(talking ? 'speaking' : state) }, [state, talking, status])

  useEffect(() => {
    if (!say?.text || say.id === spoken.current) return
    const first = spoken.current === null
    spoken.current = say.id
    if (first || !voice) return // 進頁時已經在畫面上的那則不重念
    setTalking(true)
    const stop = speak(say.text, presenter.current, { lang: LANGS[lang], onEnd: () => setTalking(false) })
    return () => { stop(); setTalking(false) }
  }, [say?.id, say?.text, voice, lang])

  const shown: AvatarState = talking ? 'speaking' : state
  return <section className="tutor-avatar" data-testid="avatar-stage" data-avatar-id={pack?.id ?? 'none'} data-avatar-state={shown} data-render-status={status} aria-label={`${label}人像`}>
    <div className="tutor-avatar-canvas" ref={host}/>
    {status === 'loading' && <p className="tutor-avatar-message">導師正在入座…</p>}
    {status === 'fallback' && <p className="tutor-avatar-message">人像暫時無法載入，對話照常進行。</p>}
    <div className="tutor-avatar-caption">
      <span className={`tutor-avatar-presence ${shown}`} aria-hidden="true"/>
      <div><strong>{label}</strong><span aria-live="polite">{STATE_LABEL[shown]}</span></div>
      <button type="button" className="tutor-avatar-voice" aria-pressed={voice} onClick={() => { const next = !voice; setVoice(next); write('avatar-voice', next ? 'on' : 'off'); if (!next) presenter.current?.stop() }}>{voice ? '語音開' : '語音關'}</button>
    </div>
    {pack?.license && <small className="tutor-avatar-license">人像：{pack.name} · {pack.license}</small>}
    {lab && packs.length > 0 && <details className="tutor-avatar-lab">
      <summary>人像選擇（開發）</summary>
      <label>模型<select value={pack?.id ?? ''} onChange={e => { const next = choosePack(packs, product, e.target.value, null); if (next) { write(storeKey, next.id); setPack(next) } }}>
        {packs.filter(p => !p.products || p.products.includes(product)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select></label>
      <p>id {pack?.id} · sha {pack?.model_sha256.slice(0, 12)}</p>
      <button type="button" onClick={() => { setTalking(true); speak('你好，我是你的導師。我們先從你的選擇開始：你為什麼這樣選？', presenter.current, { lang: LANGS.zh, onEnd: () => setTalking(false) }) }}>試說中文</button>
      <button type="button" onClick={() => { setTalking(true); speak('Hello! Let us think about this together. Why did you choose this answer?', presenter.current, { lang: LANGS.en, onEnd: () => setTalking(false) }) }}>試說英文</button>
    </details>}
  </section>
}
