import { planSpeech, speak, type Speaker } from './speech'

class TestUtterance {
  lang = ''
  rate = 1
  voice: SpeechSynthesisVoice | null = null
  onstart: SpeechSynthesisUtterance['onstart'] = null
  onboundary: SpeechSynthesisUtterance['onboundary'] = null
  onend: SpeechSynthesisUtterance['onend'] = null
  onerror: SpeechSynthesisUtterance['onerror'] = null
  constructor(public text: string) {}
}

const voice = { lang: 'zh-TW', name: 'Taiwan' } as SpeechSynthesisVoice
let voices: SpeechSynthesisVoice[]
let spoken: SpeechSynthesisUtterance[]
let synth: EventTarget & { getVoices: jest.Mock; speak: jest.Mock; cancel: jest.Mock }
let speaker: Speaker
let addListener: jest.SpyInstance
let removeListener: jest.SpyInstance
const originalSynth = Object.getOwnPropertyDescriptor(window, 'speechSynthesis')
const originalUtterance = Object.getOwnPropertyDescriptor(window, 'SpeechSynthesisUtterance')

beforeEach(() => {
  jest.useFakeTimers()
  voices = []
  spoken = []
  synth = Object.assign(new EventTarget(), {
    getVoices: jest.fn(() => voices),
    speak: jest.fn((utterance: SpeechSynthesisUtterance) => { spoken.push(utterance) }),
    cancel: jest.fn(),
  })
  addListener = jest.spyOn(synth, 'addEventListener')
  removeListener = jest.spyOn(synth, 'removeEventListener')
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synth })
  Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: TestUtterance })
  speaker = { speakTimeline: jest.fn(), alignSpeech: jest.fn(), stopSpeech: jest.fn() }
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
  jest.restoreAllMocks()
  if (originalSynth) Object.defineProperty(window, 'speechSynthesis', originalSynth)
  else Reflect.deleteProperty(window, 'speechSynthesis')
  if (originalUtterance) Object.defineProperty(window, 'SpeechSynthesisUtterance', originalUtterance)
  else Reflect.deleteProperty(window, 'SpeechSynthesisUtterance')
})

function fire(utterance: SpeechSynthesisUtterance, kind: 'start' | 'boundary' | 'end' | 'error', charIndex = 0) {
  const event = { charIndex } as SpeechSynthesisEvent & SpeechSynthesisErrorEvent
  utterance[`on${kind}`]?.call(utterance, event)
}

function expectWaitRemoved() {
  expect(removeListener).toHaveBeenCalledWith('voiceschanged', addListener.mock.calls[0][1])
}

test('the first message waits for voices and then speaks with start and boundary timing', () => {
  const onEnd = jest.fn()
  const text = '你好'
  const plan = planSpeech(text, 1.2)
  speak(text, speaker, { rate: 1.2, onEnd })
  expect(spoken).toHaveLength(0)
  expect(speaker.speakTimeline).not.toHaveBeenCalled()
  expect(jest.getTimerCount()).toBe(1)
  jest.advanceTimersByTime(500)
  // An empty notification is not a reason to give up on voice loading.
  synth.dispatchEvent(new Event('voiceschanged'))
  expect(spoken).toHaveLength(0)
  voices = [voice]
  synth.dispatchEvent(new Event('voiceschanged'))
  expect(spoken).toHaveLength(1)
  expectWaitRemoved()
  expect(jest.getTimerCount()).toBe(0)
  const utterance = spoken[0]
  expect(utterance.text).toBe(text)
  expect(utterance.lang).toBe('zh-TW')
  expect(utterance.rate).toBe(1.2)
  expect(utterance.voice).toBe(voice)
  expect(speaker.speakTimeline).not.toHaveBeenCalled()
  fire(utterance, 'start')
  expect(speaker.speakTimeline).toHaveBeenCalledWith(plan.events, plan.durationMs)
  fire(utterance, 'boundary', 1)
  expect(speaker.alignSpeech).toHaveBeenCalledWith(plan.charAt[1])
  fire(utterance, 'end')
  expect(speaker.stopSpeech).toHaveBeenCalledTimes(1)
  expect(onEnd).toHaveBeenCalledTimes(1)
  expect(utterance.onstart).toBeNull()
  expect(utterance.onboundary).toBeNull()
  expect(utterance.onend).toBeNull()
  expect(utterance.onerror).toBeNull()
  jest.advanceTimersByTime(2000)
  synth.dispatchEvent(new Event('voiceschanged'))
  expect(spoken).toHaveLength(1)
  expect(speaker.speakTimeline).toHaveBeenCalledTimes(1)
})

test.each([
  { text: '🙂你好嗎', expected: [0, 0, 62, 272, 482], durationMs: 742 },
  { text: '你🙂ab好🙂', expected: [0, 210, 210, 272, 334, 466, 676, 676], durationMs: 788 },
])('UTF-16 boundaries align each code unit in $text without advancing past its code point', ({ text, expected, durationMs }) => {
  const plan = planSpeech(text)
  expect(plan.charAt).toEqual(expected)
  expect(plan.charAt).toHaveLength(text.length)
  expect(plan.durationMs).toBe(durationMs)
  expect(plan.events[plan.events.length - 1]).toEqual({ viseme: 'sil', timeMs: durationMs - 50 })
  voices = [voice]
  const stop = speak(text, speaker)
  const utterance = spoken[0]
  fire(utterance, 'start')
  for (let charIndex = 0; charIndex < text.length; charIndex++) {
    fire(utterance, 'boundary', charIndex)
    expect(speaker.alignSpeech).toHaveBeenNthCalledWith(charIndex + 1, expected[charIndex])
  }
  // End-of-text (and later) offsets retain the existing final-character clamp.
  fire(utterance, 'boundary', text.length)
  fire(utterance, 'boundary', text.length + 1)
  expect(speaker.alignSpeech).toHaveBeenNthCalledWith(text.length + 1, expected[expected.length - 1])
  expect(speaker.alignSpeech).toHaveBeenNthCalledWith(text.length + 2, expected[expected.length - 1])
  expect(speaker.alignSpeech).toHaveBeenCalledTimes(text.length + 2)
  stop()
})

test('empty speech safely ignores the zero end-of-text boundary', () => {
  expect(planSpeech('').charAt).toEqual([])
  voices = [voice]
  const stop = speak('', speaker)
  fire(spoken[0], 'boundary', 0)
  expect(speaker.alignSpeech).not.toHaveBeenCalled()
  stop()
})

test('empty voices fall back only at the deadline and late voices do not restart playback', () => {
  const onEnd = jest.fn()
  const plan = planSpeech('你好')
  speak('你好', speaker, { onEnd })
  jest.advanceTimersByTime(999)
  expect(speaker.speakTimeline).not.toHaveBeenCalled()
  jest.advanceTimersByTime(1)
  expect(spoken).toHaveLength(0)
  expect(speaker.speakTimeline).toHaveBeenCalledWith(plan.events, plan.durationMs)
  expectWaitRemoved()
  expect(jest.getTimerCount()).toBe(1)
  voices = [voice]
  synth.dispatchEvent(new Event('voiceschanged'))
  jest.advanceTimersByTime(plan.durationMs)
  expect(onEnd).toHaveBeenCalledTimes(1)
  expect(spoken).toHaveLength(0)
  expect(speaker.speakTimeline).toHaveBeenCalledTimes(1)
  expect(jest.getTimerCount()).toBe(0)
})

test('voices ready at the deadline still use speech without a notification', () => {
  speak('你好', speaker)
  voices = [voice]
  jest.advanceTimersByTime(1000)
  expect(spoken).toHaveLength(1)
  expect(speaker.speakTimeline).not.toHaveBeenCalled()
  expectWaitRemoved()
  expect(jest.getTimerCount()).toBe(0)
})

test('stopping the wait cancels its timer and listener and rejects even a queued late notification', () => {
  const onEnd = jest.fn()
  const stop = speak('你好', speaker, { onEnd })
  const pendingListener = addListener.mock.calls[0][1] as EventListener
  jest.advanceTimersByTime(400)
  stop()
  expectWaitRemoved()
  expect(jest.getTimerCount()).toBe(0)
  expect(synth.cancel).toHaveBeenCalled()
  expect(speaker.stopSpeech).toHaveBeenCalledTimes(1)
  voices = [voice]
  synth.dispatchEvent(new Event('voiceschanged'))
  pendingListener(new Event('voiceschanged'))
  jest.advanceTimersByTime(3000)
  expect(spoken).toHaveLength(0)
  expect(speaker.speakTimeline).not.toHaveBeenCalled()
  expect(speaker.alignSpeech).not.toHaveBeenCalled()
  expect(onEnd).not.toHaveBeenCalled()
})

test('stopping after voices arrive detaches speech callbacks and blocks queued mouth activity', () => {
  const onEnd = jest.fn()
  const stop = speak('你好', speaker, { onEnd })
  voices = [voice]
  synth.dispatchEvent(new Event('voiceschanged'))
  const utterance = spoken[0]
  const start = utterance.onstart!
  const boundary = utterance.onboundary!
  const end = utterance.onend!
  const error = utterance.onerror!
  stop()
  const event = { charIndex: 1 } as SpeechSynthesisEvent & SpeechSynthesisErrorEvent
  start.call(utterance, event)
  boundary.call(utterance, event)
  end.call(utterance, event)
  error.call(utterance, event)
  expect(speaker.speakTimeline).not.toHaveBeenCalled()
  expect(speaker.alignSpeech).not.toHaveBeenCalled()
  expect(onEnd).not.toHaveBeenCalled()
  expect(jest.getTimerCount()).toBe(0)
  expect(utterance.onstart).toBeNull()
  expect(utterance.onboundary).toBeNull()
  expect(utterance.onend).toBeNull()
  expect(utterance.onerror).toBeNull()
})

test.each([false, true])('speech error preserves cleanup when started=%s', started => {
  voices = [voice]
  const onEnd = jest.fn()
  const stop = speak('你好', speaker, { onEnd })
  const utterance = spoken[0]
  if (started) fire(utterance, 'start')
  fire(utterance, 'error')
  expect(speaker.speakTimeline).toHaveBeenCalledTimes(1)
  expect(utterance.onstart).toBeNull()
  expect(utterance.onboundary).toBeNull()
  expect(utterance.onend).toBeNull()
  expect(utterance.onerror).toBeNull()
  if (started) {
    expect(speaker.stopSpeech).toHaveBeenCalledTimes(1)
    expect(onEnd).toHaveBeenCalledTimes(1)
    expect(jest.getTimerCount()).toBe(0)
  } else {
    expect(onEnd).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(1)
    stop()
    jest.advanceTimersByTime(3000)
    expect(onEnd).not.toHaveBeenCalled()
    expect(jest.getTimerCount()).toBe(0)
  }
})

test('stopping the timeout fallback also cancels its completion', () => {
  const onEnd = jest.fn()
  const stop = speak('你好', speaker, { onEnd })
  jest.advanceTimersByTime(1000)
  expect(speaker.speakTimeline).toHaveBeenCalledTimes(1)
  stop()
  expect(jest.getTimerCount()).toBe(0)
  jest.advanceTimersByTime(3000)
  expect(onEnd).not.toHaveBeenCalled()
})

test('unsupported synthesis starts mouth-only immediately without a readiness wait', () => {
  Reflect.deleteProperty(window, 'SpeechSynthesisUtterance')
  const onEnd = jest.fn()
  const plan = planSpeech('你好')
  speak('你好', speaker, { onEnd })
  expect(speaker.speakTimeline).toHaveBeenCalledWith(plan.events, plan.durationMs)
  expect(addListener).not.toHaveBeenCalled()
  expect(spoken).toHaveLength(0)
  jest.advanceTimersByTime(plan.durationMs)
  expect(onEnd).toHaveBeenCalledTimes(1)
  expect(jest.getTimerCount()).toBe(0)
})
