import { act, fireEvent, render, screen } from '@testing-library/react'
import { applyLocale } from '../../../i18n'
import { PublicConfigProvider } from '../../../shared/publicConfig'
import type { SoloAttemptView } from '../soloView'
import { micAllowed } from './useSoloVoice'
import { toPcm16 } from './voiceAudio'
import { VoiceMode } from './VoiceMode'

class FakeSocket {
  static last: FakeSocket | null = null
  readyState = 1
  sent: ArrayBuffer[] = []
  binaryType = 'arraybuffer'
  onopen: (() => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  constructor() { FakeSocket.last = this }
  send(data: ArrayBuffer) { this.sent.push(data) }
  close() { this.readyState = 3 }
  receive(message: unknown) { this.onmessage?.({ data: JSON.stringify(message) } as MessageEvent) }
}

jest.mock('../../../contract/classroomClient', () => ({
  openSoloVoiceSocket: jest.fn(() => new FakeSocket()),
  getPublicConfig: jest.fn(),
}))

let processor: { onaudioprocess: ((frame: unknown) => void) | null }

class FakeAudioContext {
  sampleRate = 48000
  currentTime = 0
  destination = {}
  resume() { return Promise.resolve() }
  close() { return Promise.resolve() }
  createMediaStreamSource() { return { connect: () => undefined } }
  createScriptProcessor() {
    processor = { onaudioprocess: null, connect: () => undefined } as never
    return processor
  }
  createBuffer(_: number, length: number) { return { duration: length / 24000, getChannelData: () => new Float32Array(length) } }
  createBufferSource() { return { connect: () => undefined, start: () => undefined, stop: () => undefined, onended: null } }
}

const base = {
  id: 'attempt-1', activity_id: 'a-1', activity_title: '倫理討論', course_id: 'c-1', course_name: '哲學導論',
  display_name: '小華', state: 'in_dialogue', scenario_index: 0,
  scenarios: [{ index: 0, id: 's1', text: '電車', answer: '不拉', status: 'in_progress', confirmed_summary: null }],
  messages: [], candidate_summary: null, summary_digest: null, principle_hint: null,
  revising: false, rejected_summary: null, notice: null, available_actions: ['send_message'],
} as unknown as SoloAttemptView

function renderVoice(view: SoloAttemptView, voiceOn = true, onView = jest.fn()) {
  render(<PublicConfigProvider initial={{ group_mode: true, voice_mode: voiceOn }}>
    <VoiceMode view={view} onView={onView} />
  </PublicConfigProvider>)
  return onView
}

function grantMic() {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: jest.fn(async () => ({ getTracks: () => [{ stop: () => undefined }] })) },
  })
}

beforeEach(async () => {
  await applyLocale('zh-Hant')
  ;(window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext
  FakeSocket.last = null
  grantMic()
})

describe('語音模式的入口', () => {
  it('後台開關關著或沒設金鑰時看不到入口', () => {
    renderVoice(base, false)
    expect(screen.queryByRole('button', { name: '語音模式' })).toBeNull()
  })

  it('開著，而且後端給了可以說話的動作，才出現入口', () => {
    renderVoice(base)
    expect(screen.getByRole('button', { name: '語音模式' })).toBeInTheDocument()
  })

  it('後端沒給動作就沒有入口，不從 state 推導', () => {
    renderVoice({ ...base, available_actions: [] })
    expect(screen.queryByRole('button', { name: '語音模式' })).toBeNull()
    expect(micAllowed({ ...base, available_actions: ['confirm_viewpoint', 'revise_viewpoint'] })).toBe(true)
    expect(micAllowed({ ...base, available_actions: ['next_scenario'] })).toBe(false)
  })
})

describe('語音模式的連線', () => {
  it('麥克風被拒時說明原因，可以繼續打字', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: jest.fn(async () => { throw new DOMException('no', 'NotAllowedError') }) },
    })
    renderVoice(base)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '語音模式' })) })
    expect(screen.getByRole('status')).toHaveTextContent('麥克風權限被拒')
  })

  it('瀏覽器不支援時說明原因', async () => {
    delete (window as unknown as { AudioContext?: unknown }).AudioContext
    renderVoice(base)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '語音模式' })) })
    expect(screen.getByRole('status')).toHaveTextContent('這個瀏覽器不支援語音模式')
  })

  it('全螢幕在球體下方顯示蘇格拉底正在說的話，後端的 view 更新到頁面', async () => {
    const onView = renderVoice(base)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '語音模式' })) })
    const socket = FakeSocket.last!
    act(() => { socket.onopen?.() })
    fireEvent.click(screen.getByRole('button', { name: '全螢幕' }))
    act(() => { socket.receive({ type: 'caption', text: '我整理一下你目前的想法。' }) })
    expect(screen.getByText('我整理一下你目前的想法。')).toBeInTheDocument()
    act(() => { socket.receive({ type: 'view', view: { ...base, state: 'confirming' } }) })
    expect(onView).toHaveBeenCalledWith(expect.objectContaining({ state: 'confirming' }))
  })

  it('後端要切回打字時關掉語音並顯示原因', async () => {
    renderVoice(base)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '語音模式' })) })
    act(() => { FakeSocket.last!.receive({ type: 'to_typing', reason: 'quota', text: '今天的語音時間用完了，可以繼續打字' }) })
    expect(screen.queryByRole('region', { name: '語音模式' })).toBeNull()
    expect(screen.getByRole('status')).toHaveTextContent('今天的語音時間用完了')
  })

  it('只送麥克風的聲音；後端沒給可以說話的動作時不收音', async () => {
    const { rerender } = render(<PublicConfigProvider initial={{ group_mode: true, voice_mode: true }}>
      <VoiceMode view={base} onView={jest.fn()} />
    </PublicConfigProvider>)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '語音模式' })) })
    const frame = { inputBuffer: { getChannelData: () => new Float32Array(4800).fill(0.1) } }
    act(() => { processor.onaudioprocess?.(frame) })
    expect(FakeSocket.last!.sent).toHaveLength(1)
    expect(FakeSocket.last!.sent[0].byteLength).toBe(1600 * 2)
    rerender(<PublicConfigProvider initial={{ group_mode: true, voice_mode: true }}>
      <VoiceMode view={{ ...base, available_actions: [] }} onView={jest.fn()} />
    </PublicConfigProvider>)
    act(() => { processor.onaudioprocess?.(frame) })
    expect(FakeSocket.last!.sent).toHaveLength(1)
  })
})

describe('聲音格式', () => {
  it('48 kHz 的麥克風轉成 16 kHz PCM16', () => {
    const pcm = new Int16Array(toPcm16(new Float32Array(480).fill(0.5), 48000))
    expect(pcm).toHaveLength(160)
    // Int16 truncates: 0.5 × 32767 = 16383.5 → 16383.
    expect(pcm[0]).toBe(16383)
  })
})
