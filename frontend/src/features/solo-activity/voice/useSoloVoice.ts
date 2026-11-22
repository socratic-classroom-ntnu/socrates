import { useCallback, useEffect, useRef, useState } from 'react'
import { openSoloVoiceSocket } from '../../../contract/classroomClient'
import { can, type SoloAction, type SoloAttemptView } from '../soloView'
import { audioContextClass, level, Player, toPcm16 } from './voiceAudio'

export type VoiceStatus = 'off' | 'connecting' | 'listening' | 'thinking' | 'speaking'
export type VoiceError = 'micDenied' | 'unsupported' | 'unavailable' | 'service'
export type VoiceEnd = { reason: string; text: string }

type ServerMessage =
  | { type: 'caption'; text: string }
  | { type: 'student'; text: string }
  | { type: 'view'; view: SoloAttemptView }
  | { type: 'interrupted' }
  | { type: 'turn_complete' }
  | { type: 'to_typing'; reason: string; text: string }

// Actions a spoken answer can press: a message, or 對／不太對 on a scenario's or the final summary.
const SPOKEN_ACTIONS: SoloAction[] = ['send_message', 'confirm_viewpoint', 'submit_reflection']

/** Whether the microphone may be open: only when the backend offers a spoken step. */
export function micAllowed(view: SoloAttemptView): boolean {
  return SPOKEN_ACTIONS.some(action => can(view, action))
}

export function useSoloVoice(view: SoloAttemptView, onView: (view: SoloAttemptView) => void) {
  const [status, setStatus] = useState<VoiceStatus>('off')
  const [caption, setCaption] = useState('')
  const [heard, setHeard] = useState('')
  const [error, setError] = useState<VoiceError | null>(null)
  const [ended, setEnded] = useState<VoiceEnd | null>(null)
  const [loudness, setLoudness] = useState(0)
  const socket = useRef<WebSocket | null>(null)
  const context = useRef<AudioContext | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const player = useRef<Player | null>(null)
  const processor = useRef<ScriptProcessorNode | null>(null)
  // Each start gets its own number; stop (and unmount) moves it on, so a start still waiting
  // for the microphone, or an old connection's late events, can tell they are no longer current.
  const run = useRef(0)
  const micOpen = useRef(micAllowed(view))
  const viewRef = useRef(onView)
  viewRef.current = onView
  micOpen.current = micAllowed(view)

  const stop = useCallback(() => {
    run.current += 1
    if (processor.current) processor.current.onaudioprocess = null
    processor.current = null
    socket.current?.close()
    socket.current = null
    stream.current?.getTracks().forEach(track => track.stop())
    stream.current = null
    player.current?.stop()
    player.current = null
    void context.current?.close().catch(() => undefined)
    context.current = null
    setStatus('off')
    setLoudness(0)
  }, [])

  useEffect(() => stop, [stop])

  const onMessage = useCallback((event: MessageEvent) => {
    if (event.data instanceof ArrayBuffer) {
      player.current?.play(event.data)
      setStatus('speaking')
      return
    }
    let message: ServerMessage
    try { message = JSON.parse(String(event.data)) as ServerMessage } catch { return }
    if (message.type === 'caption') setCaption(message.text)
    else if (message.type === 'student') { setHeard(message.text); setCaption(''); setStatus('thinking') }
    else if (message.type === 'view') viewRef.current(message.view)
    else if (message.type === 'interrupted') { player.current?.stop(); setStatus('listening') }
    else if (message.type === 'turn_complete') {
      const left = player.current?.pending() ?? 0
      window.setTimeout(() => setStatus(current => (current === 'speaking' ? 'listening' : current)), left * 1000)
    } else if (message.type === 'to_typing') {
      setEnded({ reason: message.reason, text: message.text })
      stop()
    }
  }, [stop])

  /** Called from the button press: the press unlocks audio on phones. */
  const start = useCallback(async () => {
    if (socket.current || stream.current || context.current) stop()
    const mine = (run.current += 1)
    setError(null)
    setEnded(null)
    const Context = audioContextClass()
    if (!Context || !navigator.mediaDevices?.getUserMedia) { setError('unsupported'); return }
    const audio = new Context()
    context.current = audio
    void audio.resume().catch(() => undefined)
    setStatus('connecting')
    let media: MediaStream
    try {
      media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (reason) {
      if (run.current !== mine) return
      const denied = reason instanceof DOMException && (reason.name === 'NotAllowedError' || reason.name === 'SecurityError')
      setError(denied ? 'micDenied' : 'unsupported')
      stop()
      return
    }
    if (run.current !== mine) {
      // Cancelled (or unmounted, or started again) while the browser asked for the microphone.
      media.getTracks().forEach(track => track.stop())
      void audio.close().catch(() => undefined)
      return
    }
    stream.current = media
    player.current = new Player(audio, setLoudness)
    const ws = openSoloVoiceSocket(view.id)
    socket.current = ws
    ws.onmessage = event => { if (socket.current === ws) onMessage(event) }
    ws.onopen = () => { if (socket.current === ws) setStatus('listening') }
    ws.onclose = closed => {
      if (socket.current !== ws) return
      if (closed.code === 4403 || closed.code === 4409) setError('unavailable')
      else if (closed.code !== 1000) setError('service')
      stop()
    }
    const source = audio.createMediaStreamSource(media)
    const node = audio.createScriptProcessor(4096, 1, 1)
    processor.current = node
    node.onaudioprocess = frame => {
      const samples = frame.inputBuffer.getChannelData(0)
      if (!micOpen.current || ws.readyState !== WebSocket.OPEN) return
      ws.send(toPcm16(samples, audio.sampleRate))
      setLoudness(previous => (player.current?.pending() ? previous : level(samples)))
    }
    source.connect(node)
    node.connect(audio.destination)
  }, [onMessage, stop, view.id])

  return { status, caption, heard, error, ended, loudness, active: status !== 'off', start, stop }
}
