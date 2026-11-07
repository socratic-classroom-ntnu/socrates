import { useEffect, useRef, useState } from 'react'

type SpeechRecognitionConstructor = new () => SpeechRecognition

function recognitionConstructor(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const speechWindow = window as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null
}

export function speechLanguage(locale: string): string {
  if (locale === 'zh-Hans') return 'zh-CN'
  if (locale === 'en') return 'en-US'
  if (locale === 'es') return 'es-ES'
  return 'zh-TW'
}

export function useSoloSpeechInput(locale: string, onTranscript: (transcript: string) => void) {
  const Constructor = recognitionConstructor()
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const transcriptRef = useRef(onTranscript)
  const [recording, setRecording] = useState(false)
  transcriptRef.current = onTranscript

  useEffect(() => () => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
  }, [])

  function toggle() {
    if (recording) {
      recognitionRef.current?.stop()
      return
    }
    if (!Constructor) return

    const recognition = new Constructor()
    recognition.lang = speechLanguage(locale)
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = event => {
      const transcript = Array.from(event.results)
        .map(result => result[0]?.transcript ?? '')
        .join('')
        .trim()
      if (transcript) transcriptRef.current(transcript)
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setRecording(false)
    }
    recognition.onerror = recognition.onend
    recognitionRef.current = recognition
    setRecording(true)
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      setRecording(false)
    }
  }

  return { supported: Constructor !== null, recording, toggle }
}
