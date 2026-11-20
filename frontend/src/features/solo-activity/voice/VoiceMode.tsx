import { useState } from 'react'
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

/** The sphere: listens and speaks by loudness, pulses while thinking (Figma 「語音模式」). */
function Sphere({ status, loudness }: { status: VoiceStatus; loudness: number }) {
  const scale = status === 'listening' || status === 'speaking' ? 1 + loudness * 0.35 : 1
  return <div className={`solo-voice__sphere solo-voice__sphere--${status}`} style={{ transform: `scale(${scale.toFixed(3)})` }} aria-hidden="true" />
}

/** Voice mode for the solo dialogue: the entry, the floating panel and the full screen.
 *
 * Shown only when the 後台 switch is on with its key set (public-config) and the backend offers a
 * spoken step; the microphone itself is open only while ``available_actions`` allow it. */
export function VoiceMode({ view, onView }: { view: SoloAttemptView; onView: (view: SoloAttemptView) => void }) {
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
  return <section
    className={full ? 'solo-voice solo-voice--full' : 'solo-voice'}
    aria-label={t('voice.panel')}
    role={full ? 'dialog' : 'region'}
    aria-modal={full ? true : undefined}
  >
    <Sphere status={voice.status} loudness={voice.loudness} />
    <p className="solo-voice__status" aria-live="polite">{statusText}</p>
    {/* Full screen shows what Socrates is saying below the sphere, the summary included. */}
    {full && voice.caption && <p className="solo-voice__caption">{voice.caption}</p>}
    {voice.heard && voice.status === 'thinking' && <p className="solo-voice__heard">{t('voice.youSaid', { text: voice.heard })}</p>}
    <div className="solo-voice__actions">
      <button type="button" className="solo-voice__toggle" onClick={() => setFull(!full)}>
        {t(full ? 'voice.exitFullscreen' : 'voice.fullscreen')}
      </button>
      <button type="button" className="solo-voice__exit" onClick={() => { setFull(false); voice.stop() }}>
        {t('voice.toTyping')}
      </button>
    </div>
  </section>
}
