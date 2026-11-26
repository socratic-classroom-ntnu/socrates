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

/** Why the last dictation stopped without text, for a note under the box (PR-19: in Helium the
 * microphone switched off at once and said nothing). */
export type SpeechNote = 'network' | 'denied' | 'noMic' | 'noSpeech' | 'language' | 'other'

export function speechNote(code: string | undefined): SpeechNote {
  switch (code) {
    case 'network': return 'network'
    case 'not-allowed':
    case 'service-not-allowed': return 'denied'
    case 'audio-capture': return 'noMic'
    case 'no-speech': return 'noSpeech'
    case 'language-not-supported': return 'language'
    default: return 'other'
  }
}

export function useSoloSpeechInput(locale: string, onTranscript: (transcript: string) => void) {
  const Constructor = recognitionConstructor()
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const transcriptRef = useRef(onTranscript)
  const [recording, setRecording] = useState(false)
  const [note, setNote] = useState<SpeechNote | null>(null)
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
    let heard = false
    let failed = false
    recognition.lang = speechLanguage(locale)
    recognition.continuous = false
    recognition.interimResults = false
    recognition.onresult = event => {
      const transcript = Array.from(event.results)
        .map(result => result[0]?.transcript ?? '')
        .join('')
        .trim()
      if (transcript) {
        heard = true
        transcriptRef.current(transcript)
      }
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setRecording(false)
      if (!heard && !failed) setNote('noSpeech')
    }
    recognition.onerror = event => {
      failed = true
      recognitionRef.current = null
      setRecording(false)
      setNote(speechNote(event.error))
    }
    recognitionRef.current = recognition
    setNote(null)
    setRecording(true)
    try {
      recognition.start()
    } catch {
      recognitionRef.current = null
      setRecording(false)
      setNote('other')
    }
  }

  return { supported: Constructor !== null, recording, note, toggle }
}
