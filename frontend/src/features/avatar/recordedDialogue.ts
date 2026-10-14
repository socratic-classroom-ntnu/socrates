import { timeline } from './runtime/runtimePack.mjs'
import type { PackPresenter } from './runtime/packPresenter.mjs'

// Historical Portal-Goose recording, not the Jenny multi-segment CE fixture.
export const RECORDED_DIALOGUE = {
  packageSha256: 'e07766c3411535271db91c8cb9d30c04a1855cd0d461dde46b05ef2e4fa433cc',
  text: 'Hello! Welcome to our coffee shop. What can I get started for you today? Are you in the mood for coffee, tea, or something else?',
  voice: 'en-US-GuyNeural',
  language: 'en-US',
} as const
const hashes = {
  'fixture.json': '80f16a023928f1246ce3ceb19059b6a0ef52ad4e553e5c03c7257f44aaa1b024',
  'audio.mp3': '6cc2b782be71a9a2767574ae65f3b50c2537928b8cf21f2d6eb7d4b182321ab3',
  'viseme-events.json': '91e310506ceebbcbd88f7d68201f2e92025344280c95dbd051dd42937c21c4ad',
  'word-timing.json': 'e18bb7278d95a1cb661f45cbb0e235184c0b4323bde3c43b852725be0ca6e891',
} as const
async function asset(name: keyof typeof hashes, signal: AbortSignal) {
  const response = await fetch(`/avatar-fixtures/coffee-shop/${name}`, { signal })
  if (!response.ok) throw Error(`RECORDED_ASSET_UNAVAILABLE:${name}`)
  const bytes = await response.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const hex = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  if (hex !== hashes[name]) throw Error(`RECORDED_ASSET_DIGEST_MISMATCH:${name}`)
  return bytes
}

/** Decode the existing recording; only the presenter's AudioLane starts playback. */
export async function playRecordedDialogue(presenter: PackPresenter, signal: AbortSignal) {
  if (signal.aborted) return { state: 'SUPERSEDED' }
  let stop: () => void
  const cancelled = new Promise<{ state: string }>(resolve => {
    stop = () => { presenter.stop(); resolve({ state: 'SUPERSEDED' }) }
  })
  signal.addEventListener('abort', stop!, { once: true })
  const replay = async () => {
    // Start unlock synchronously in the click handler, before any fetch or decode.
    const [_, metadata, audio, visemes, words] = await Promise.all([
      presenter.prepareAudio(),
      ...(['fixture.json', 'audio.mp3', 'viseme-events.json', 'word-timing.json'] as const).map(name => asset(name, signal)),
    ])
    const fixture = JSON.parse(new TextDecoder().decode(metadata))
    const events = JSON.parse(new TextDecoder().decode(visemes)).events
    if (fixture.text !== RECORDED_DIALOGUE.text || fixture.voice !== RECORDED_DIALOGUE.voice ||
        fixture.language !== RECORDED_DIALOGUE.language || events.length !== 90 || JSON.parse(new TextDecoder().decode(words)).events.length !== 31) {
      throw Error('RECORDED_DIALOGUE_IDENTITY_MISMATCH')
    }
    const context = new AudioContext()
    let buffer: AudioBuffer
    try { buffer = await context.decodeAudioData(audio) } finally { await context.close() }
    timeline(events, buffer.duration * 1000) // Reject invalid offsets before any audible effect.
    if (signal.aborted) return { state: 'SUPERSEDED' }
    return presenter.play(buffer, events)
  }
  try { return await Promise.race([replay(), cancelled]) }
  finally { signal.removeEventListener('abort', stop!) }
}
