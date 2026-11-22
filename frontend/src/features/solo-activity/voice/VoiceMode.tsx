import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../../../i18n/useT'
import { useFeatures } from '../../../shared/publicConfig'
import type { SoloAttemptView } from '../soloView'
import { micAllowed, useSoloVoice, type VoiceStatus } from './useSoloVoice'

const STATUS_KEY: Record<Exclude<VoiceStatus, 'off'>, string> = {
  connecting: 'voice.connecting',
  listening: 'voice.listening',
  thinking: 'voice.thinking',
  speaking: 'voice.speaking',
}

/** One star polygon {count/step} of the Hoberman sphere, as SVG points around (0, 0). */
function star(count: number, step: number, radius: number, turn: number): string {
  const points: string[] = []
  for (let i = 0; i < count; i += 1) {
    const angle = turn + (2 * Math.PI * ((i * step) % count)) / count
    points.push(`${(radius * Math.cos(angle)).toFixed(2)},${(radius * Math.sin(angle)).toFixed(2)}`)
  }
  return points.join(' ')
}

const LAYERS = [
  { count: 12, step: 5, radius: 34, turn: 0 },
  { count: 9, step: 4, radius: 30, turn: 0.35 },
  { count: 7, step: 3, radius: 26, turn: 0.9 },
]

/** The wireframe Hoberman sphere of the Figma 「語音模式」 frames: folded while listening, turning
 * while thinking, and opening with the loudness while Socrates speaks. */
function Sphere({ status, loudness }: { status: VoiceStatus; loudness: number }) {
  const open = status === 'speaking' ? 1.12 + loudness * 0.3 : status === 'listening' ? 0.92 + loudness * 0.15 : 1
  return <svg className={`solo-voice__sphere solo-voice__sphere--${status}`} viewBox="-50 -50 100 100" aria-hidden="true">
    <circle className="solo-voice__ring" r="46" />
    <circle className="solo-voice__ring solo-voice__ring--inner" r="43" />
    <g className="solo-voice__frame" style={{ transform: `scale(${open.toFixed(3)})` }}>
      {LAYERS.map(layer => <polygon key={layer.count} points={star(layer.count, layer.step, layer.radius, layer.turn)} />)}
    </g>
  </svg>
}

/** Voice mode for the solo dialogue: the entry, the 蘇格拉底 card and the full screen.
 *
 * Shown only when the 後台 switch is on with its key set (public-config) and the backend offers a
 * spoken step; the microphone itself is open only while ``available_actions`` allow it. The card
 * goes into ``slot`` (the left column under the scenario, Figma 749:324) when the page gives one;
 * the full screen covers the page wherever the card is. */
export function VoiceMode({ view, onView, slot = null }: {
  view: SoloAttemptView
  onView: (view: SoloAttemptView) => void
  slot?: HTMLElement | null
}) {
  const { t } = useT('solo')
  const { features } = useFeatures()
  const voice = useSoloVoice(view, onView)
  const [full, setFull] = useState(false)
  const offered = features.voice_mode === true && micAllowed(view)

  if (!voice.active) {
    const note = voice.error ? t(`voice.${voice.error}`) : voice.ended?.text
    if (!offered && !note) return null
    return <div className="solo-voice-entry">
      {offered && <button
        className="solo-voice-entry__button"
        type="button"
        onClick={() => { void voice.start() }}
        title={t('voice.enterHint')}
      >{t('voice.enter')}</button>}
      {note && <p className="solo-voice-entry__note" role="status">{note}</p>}
    </div>
  }

  const statusText = voice.status === 'off' ? '' : t(STATUS_KEY[voice.status])
  const panel = <section
    className={full ? 'solo-voice solo-voice--full' : 'solo-voice'}
    aria-label={t('voice.panel')}
    role={full ? 'dialog' : 'region'}
    aria-modal={full ? true : undefined}
  >
    <div className="solo-voice__head">
      <strong>{t('voice.who')}</strong>
      <button type="button" className="solo-voice__toggle" onClick={() => setFull(!full)}>
        {full ? t('voice.exitFullscreen') : <><span aria-hidden="true">↗ </span>{t('voice.fullscreen')}</>}
      </button>
    </div>
    <Sphere status={voice.status} loudness={voice.loudness} />
    <p className="solo-voice__status" aria-live="polite">{statusText}</p>
    {/* Full screen shows what Socrates is saying below the sphere, the summary included. */}
    {full && voice.caption && <p className="solo-voice__caption">{voice.caption}</p>}
    {voice.heard && voice.status === 'thinking' && <p className="solo-voice__heard">{t('voice.youSaid', { text: voice.heard })}</p>}
    <button type="button" className="solo-voice__exit" onClick={() => { setFull(false); voice.stop() }}>
      {t('voice.toTyping')}
    </button>
  </section>
  return slot && !full ? createPortal(panel, slot) : panel
}
