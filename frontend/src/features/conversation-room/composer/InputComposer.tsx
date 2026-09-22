import { TextInputAdapter } from './TextInputAdapter'
import { VoiceInputAdapter } from '../voice/VoiceInputAdapter'

interface Props {
  value: string
  busy: boolean
  enabled: boolean
  onChange: (value: string) => void
  onListening: (active: boolean) => void
  onTranscript: (text: string, confidence?: number) => void | Promise<void>
  onSend: () => void
}

export function InputComposer({
  value,
  busy,
  enabled,
  onChange,
  onListening,
  onTranscript,
  onSend,
}: Props) {
  return (
    <footer className="input-composer" data-sticky-composer="true">
      <div className="composer-mode">
        <span>文字／語音輸入</span>
        <span>Enter 傳送 · Shift+Enter 換行</span>
      </div>
      <div className="composer-row">
        <TextInputAdapter value={value} enabled={enabled && !busy} onChange={onChange} onSubmit={onSend} />
        <VoiceInputAdapter enabled={enabled && !busy} onTranscript={onTranscript} onListening={onListening} />
        <button
          className="room-send-button"
          onClick={onSend}
          disabled={!enabled || busy || value.trim() === ''}
          aria-label="傳送"
          type="button"
        >
          ↑
        </button>
      </div>
    </footer>
  )
}
