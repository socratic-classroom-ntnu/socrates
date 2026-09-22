import { useRef, useState } from 'react'

interface Props {
  enabled: boolean
  onTranscript: (text: string, confidence?: number) => void | Promise<void>
  onListening: (active: boolean) => void
}

export function VoiceInputAdapter({ enabled, onTranscript, onListening }: Props) {
  const [active, setActive] = useState(false)
  const [supported] = useState(() => Boolean(window.SpeechRecognition || window.webkitSpeechRecognition))
  const recognition = useRef<SpeechRecognition | null>(null)

  function finish() {
    setActive(false)
    onListening(false)
  }

  function toggle() {
    if (!enabled || !supported) return
    if (active) {
      recognition.current?.stop()
      finish()
      return
    }
    const Constructor = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Constructor) return
    const instance = new Constructor()
    recognition.current = instance
    instance.lang = 'zh-TW'
    instance.continuous = false
    instance.interimResults = true
    instance.onresult = (event) => {
      let transcript = ''
      let confidence: number | undefined
      for (let index = 0; index < event.results.length; index += 1) {
        transcript += event.results[index][0]?.transcript ?? ''
        if (event.results[index].isFinal) confidence = event.results[index][0]?.confidence
      }
      if (transcript.trim()) void onTranscript(transcript.trim(), confidence)
    }
    instance.onerror = finish
    instance.onend = finish
    instance.start()
    setActive(true)
    onListening(true)
  }

  return (
    <button
      className={`room-voice-button ${active ? 'active' : ''}`}
      onClick={toggle}
      type="button"
      aria-label={active ? '停止語音輸入' : '開始語音輸入'}
      disabled={!enabled || !supported}
      title={supported ? '語音輸入' : '目前瀏覽器以文字輸入為主'}
    >
      <span aria-hidden="true">{active ? '■' : '◉'}</span>
      <small>{active ? '停止' : supported ? '語音' : '文字'}</small>
    </button>
  )
}
