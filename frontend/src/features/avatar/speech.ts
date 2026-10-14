// 導師語音輸出（第一階段：瀏覽器內建語音）＋由文字估算嘴型時間軸。
// 瀏覽器內建語音拿不到音訊，所以嘴型照文字估算，再用 boundary 事件（念到第幾個字）對齊。
// 之後接後端 TTS 時改用音訊＋字的時間點（PackPresenter.play），這支只保留估算的部分。

export type VisemeEvent = { viseme: string; timeMs: number }
export type SpeechPlan = { events: VisemeEvent[]; durationMs: number; charAt: number[] }

const CJK = /[㐀-鿿豈-﫿]/
const PAUSE = /[，。！？、；：,.!?;:\n]/
const ZH_VOWELS = ['aa', 'E', 'oh', 'ih', 'ou']
const ZH_ONSETS = ['nn', 'DD', 'SS', 'PP', 'kk', 'CH']

function englishViseme(word: string, i: number): string | null {
  const two = word.slice(i, i + 2)
  if (two === 'th') return 'TH'
  if (two === 'ch' || two === 'sh') return 'CH'
  const c = word[i]
  if ('aeiouy'.includes(c)) return { a: 'aa', e: 'E', i: 'ih', o: 'oh', u: 'ou', y: 'ih' }[c] ?? 'aa'
  if ('pbm'.includes(c)) return 'PP'
  if ('fv'.includes(c)) return 'FF'
  if ('td'.includes(c)) return 'DD'
  if ('kgcq'.includes(c)) return 'kk'
  if ('jz'.includes(c)) return 'CH'
  if ('sx'.includes(c)) return 'SS'
  if ('nl'.includes(c)) return 'nn'
  if (c === 'r') return 'RR'
  if (c === 'w') return 'ou'
  return null
}

/** 文字 → 嘴型時間軸。中文每字一個開口（聲母閉合＋韻母），英文照字母粗估；標點停頓。rate＝語速倍率。 */
export function planSpeech(text: string, rate = 1): SpeechPlan {
  const events: VisemeEvent[] = []
  const charAt: number[] = []
  let t = 0
  const zhChar = 210 / rate, letter = 62 / rate, wordGap = 70 / rate, pause = 260 / rate
  const chars = Array.from(text)
  let i = 0
  while (i < chars.length) {
    const c = chars[i]
    charAt.push(t)
    if (CJK.test(c)) {
      const code = c.codePointAt(0) ?? 0
      events.push({ viseme: ZH_ONSETS[code % ZH_ONSETS.length], timeMs: t })
      events.push({ viseme: ZH_VOWELS[(code >> 3) % ZH_VOWELS.length], timeMs: t + zhChar * 0.3 })
      t += zhChar
      i++
    } else if (/[A-Za-z]/.test(c)) {
      let j = i
      while (j < chars.length && /[A-Za-z']/.test(chars[j])) j++
      const word = chars.slice(i, j).join('').toLowerCase()
      for (let k = 0; k < word.length; k++) {
        if (k > 0) charAt.push(t)
        const v = englishViseme(word, k)
        if (v) events.push({ viseme: v, timeMs: t })
        t += letter
      }
      i = j
      t += wordGap
    } else if (PAUSE.test(c)) {
      events.push({ viseme: 'sil', timeMs: t })
      t += pause
      i++
    } else {
      t += c.trim() ? letter : wordGap / 2
      i++
    }
  }
  events.push({ viseme: 'sil', timeMs: t })
  return { events, durationMs: Math.max(t + 50, 100), charAt }
}

export type Speaker = {
  speakTimeline: (events: VisemeEvent[], durationMs: number, startAt?: number) => void
  alignSpeech: (atMs: number) => void
  stopSpeech: () => void
}

export const LANGS = { zh: 'zh-TW', en: 'en-US' } as const

export function speechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

function pickVoice(lang: string): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  const base = lang.slice(0, 2)
  return voices.find(v => v.lang === lang) ?? voices.find(v => v.lang.replace('_', '-').startsWith(base))
}

/** 念出 text 並驅動 speaker 的嘴型；聲音尚未載入時最多等一秒。不支援語音時只播嘴型。回傳停止函式。 */
export function speak(text: string, speaker: Speaker | null, opts: { lang?: string; rate?: number; onEnd?: () => void } = {}): () => void {
  const rate = opts.rate ?? 1
  const plan = planSpeech(text, rate)
  // 沒有語音（不支援、沒有任何聲音、或一開口就失敗）時，嘴型照估算的時間軸動，結束時照樣回報。
  const mouthOnly = () => {
    speaker?.speakTimeline(plan.events, plan.durationMs)
    const timer = window.setTimeout(() => opts.onEnd?.(), plan.durationMs)
    return () => { window.clearTimeout(timer); speaker?.stopSpeech() }
  }
  if (!speechSupported()) return mouthOnly()
  const synth = window.speechSynthesis
  let stopped = false
  let finished = false
  let waiting = false
  let waitTimer: number | undefined
  let utterance: SpeechSynthesisUtterance | null = null
  let fallbackStop: (() => void) | null = null
  const clearWait = () => {
    if (waitTimer !== undefined) window.clearTimeout(waitTimer)
    waitTimer = undefined
    if (waiting) synth.removeEventListener('voiceschanged', voicesChanged)
    waiting = false
  }
  const clearUtterance = () => {
    if (!utterance) return
    utterance.onstart = null
    utterance.onboundary = null
    utterance.onend = null
    utterance.onerror = null
  }
  const start = () => {
    if (stopped || finished || utterance || fallbackStop) return
    clearWait()
    if (synth.getVoices().length === 0) {
      fallbackStop = mouthOnly()
      return
    }
    synth.cancel()
    utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = opts.lang ?? LANGS.zh
    utterance.rate = rate
    const voice = pickVoice(utterance.lang)
    if (voice) utterance.voice = voice
    let started = false
    const done = () => {
      if (stopped || finished) return
      finished = true
      clearUtterance()
      speaker?.stopSpeech()
      opts.onEnd?.()
    }
    utterance.onboundary = (e: SpeechSynthesisEvent) => {
      if (stopped || finished) return
      const at = plan.charAt[Math.min(e.charIndex, plan.charAt.length - 1)]
      if (at !== undefined) speaker?.alignSpeech(at)
    }
    utterance.onstart = () => {
      if (stopped || finished) return
      started = true
      speaker?.speakTimeline(plan.events, plan.durationMs)
    }
    utterance.onend = done
    utterance.onerror = () => {
      if (stopped || finished) return
      if (started) done()
      else {
        finished = true
        clearUtterance()
        fallbackStop = mouthOnly()
      }
    }
    synth.speak(utterance)
  }
  function voicesChanged() {
    if (waiting && synth.getVoices().length > 0) start()
  }
  if (synth.getVoices().length > 0) start()
  else {
    waiting = true
    synth.addEventListener('voiceschanged', voicesChanged)
    waitTimer = window.setTimeout(start, 1000)
  }
  return () => {
    stopped = true
    clearWait()
    clearUtterance()
    synth.cancel()
    fallbackStop?.()
    speaker?.stopSpeech()
  }
}
