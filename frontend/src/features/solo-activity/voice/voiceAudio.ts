/** Microphone capture as 16 kHz PCM16 and playback of Socrates' 24 kHz PCM16, for voice mode. */

export const INPUT_RATE = 16000
export const OUTPUT_RATE = 24000

type AudioWindow = { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }

export function audioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as AudioWindow
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

/** Whether this browser can do voice mode at all. */
export function voiceSupported(): boolean {
  return audioContextClass() !== null
    && typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices?.getUserMedia === 'function'
    && typeof WebSocket !== 'undefined'
}

/** Float samples at ``fromRate`` to PCM16 at 16 kHz (averaging each window). */
export function toPcm16(samples: Float32Array, fromRate: number): ArrayBuffer {
  const ratio = fromRate / INPUT_RATE
  const length = Math.floor(samples.length / ratio)
  const out = new Int16Array(length)
  for (let i = 0; i < length; i += 1) {
    const start = Math.floor(i * ratio)
    const end = Math.min(samples.length, Math.floor((i + 1) * ratio))
    let sum = 0
    for (let j = start; j < end; j += 1) sum += samples[j]
    const value = Math.max(-1, Math.min(1, end > start ? sum / (end - start) : 0))
    out[i] = value < 0 ? value * 0x8000 : value * 0x7fff
  }
  return out.buffer
}

/** Loudness of a chunk (0–1), for the sphere's size. */
export function level(samples: Float32Array | Int16Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  const scale = samples instanceof Int16Array ? 0x8000 : 1
  for (let i = 0; i < samples.length; i += 1) sum += (samples[i] / scale) ** 2
  return Math.min(1, Math.sqrt(sum / samples.length) * 4)
}

/** Plays PCM16 chunks back to back; ``stop`` drops whatever is still queued (an interruption). */
export class Player {
  private next = 0
  private sources: AudioBufferSourceNode[] = []

  constructor(private readonly context: AudioContext, private readonly onLevel: (value: number) => void) {}

  play(chunk: ArrayBuffer): void {
    const pcm = new Int16Array(chunk)
    if (pcm.length === 0) return
    const buffer = this.context.createBuffer(1, pcm.length, OUTPUT_RATE)
    const channel = buffer.getChannelData(0)
    for (let i = 0; i < pcm.length; i += 1) channel[i] = pcm[i] / 0x8000
    const source = this.context.createBufferSource()
    source.buffer = buffer
    source.connect(this.context.destination)
    const at = Math.max(this.context.currentTime, this.next)
    source.start(at)
    this.next = at + buffer.duration
    this.sources.push(source)
    source.onended = () => { this.sources = this.sources.filter(s => s !== source) }
    this.onLevel(level(pcm))
  }

  /** Seconds of audio still to play. */
  pending(): number {
    return Math.max(0, this.next - this.context.currentTime)
  }

  stop(): void {
    for (const source of this.sources) {
      try { source.stop() } catch { /* already ended */ }
    }
    this.sources = []
    this.next = 0
  }
}
