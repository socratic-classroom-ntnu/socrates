import { useEffect, useRef, useState } from 'react'
import type { TutorPresenceState } from '../model/types'

interface AvatarEngine {
  showAvatar: (avatar: { url: string; body: string; avatarMood: string }) => Promise<void>
  setView: (view: string) => void
  start?: () => void
  stop?: () => void
  renderer?: { dispose: () => void }
}

interface Props {
  state: TutorPresenceState
  onReady?: (ready: boolean) => void
}

const STATE_LABELS: Record<TutorPresenceState, string> = {
  idle: '正在聆聽你的想法',
  listening: '語音輸入中',
  thinking: '正在思考你的觀點',
  speaking: '回覆已送達',
}

/** CE avatar renderer. Audio/viseme presentation is a separate Portal-owned adapter. */
export function PortraitStage({ state, onReady }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const callback = useRef(onReady)
  callback.current = onReady
  const [status, setStatus] = useState<'loading' | 'ready' | 'retry'>('loading')
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let released = false
    let engine: AvatarEngine | undefined
    const hostElement = host.current
    if (!hostElement) return
    const el = document.createElement('div')
    el.className = 'ce-renderer-instance'
    hostElement.appendChild(el)
    setStatus('loading')
    void (async () => {
      try {
        const { TalkingHead } = await import('@met4citizen/talkinghead')
        if (released) return
        engine = new TalkingHead(el, {
          lipsyncModules: [],
          cameraView: 'upper',
          avatarMood: 'happy',
          avatarSpeakingEyeContact: 0.9,
          avatarIdleEyeContact: 0.7,
          modelFPS: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 15 : 30,
          modelPixelRatio: Math.min(window.devicePixelRatio || 1, 1.8),
          modelMovementFactor: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.45,
          avatarIdleHeadMove: 0.22,
          lightAmbientColor: 0xfff1e6,
          lightAmbientIntensity: 2.1,
          lightDirectColor: 0xe5c7b5,
          lightDirectIntensity: 24,
          lightDirectPhi: 1.1,
          lightDirectTheta: 1.8,
          lightSpotColor: 0xb0a5e3,
          lightSpotIntensity: 7,
          lightSpotPhi: 0.25,
          lightSpotTheta: 4.2,
          cameraRotateEnable: false,
          cameraPanEnable: false,
          cameraZoomEnable: false,
        }) as AvatarEngine
        await engine.showAvatar({
          url: '/avatars/ce-brunette/avatar.glb',
          body: 'F',
          avatarMood: 'happy',
        })
        if (released) { engine.stop?.(); engine.renderer?.dispose(); return }
        engine.setView('upper')
        engine.start?.()
        setStatus('ready')
        callback.current?.(true)
      } catch {
        if (!released) { setStatus('retry'); callback.current?.(false) }
      }
    })()
    return () => {
      released = true
      engine?.stop?.()
      engine?.renderer?.dispose()
      el.remove()
    }
  }, [revision])

  return (
    <section className="ce-portrait" data-testid="avatar-stage" data-avatar-id="ce-brunette" data-avatar-state={state} data-render-status={status} aria-label="蘇格拉底導師人像">
      <div className="ce-portrait-halo" aria-hidden="true" />
      <div className="ce-portrait-canvas" ref={host} />
      {status === 'loading' && <p className="ce-avatar-message" role="status">導師正在入座…</p>}
      {status === 'retry' && <div className="ce-avatar-message" role="status"><p>人像載入可在此續接</p><button type="button" onClick={() => setRevision((v) => v + 1)}>重新載入人像</button></div>}
      <div className="ce-portrait-caption"><span className={`ce-presence ${state}`} aria-hidden="true" /><div><strong>蘇格拉底導師</strong><span aria-live="polite">{STATE_LABELS[state]}</span></div></div>
    </section>
  )
}
