import { choosePack, type AvatarPack } from './TutorAvatar'
import { planSpeech, speak } from './speech'
import { timeline, VISEMES } from './runtime/runtimePack.mjs'
import { lastTutorLine } from '../../pages/GroupClassroom'

const pack = (id: string, products?: string[]): AvatarPack => ({ id, name: id, products, model_sha256: 'a'.repeat(64) })

test('CE only lists packs cleared for CE; Socratic may use non-commercial ones', () => {
  const packs = [pack('brunette', ['socratic']), pack('meshy', ['socratic', 'ce'])]
  expect(choosePack(packs, 'ce', 'brunette', null)?.id).toBe('meshy')
  expect(choosePack(packs, 'socratic', 'brunette', null)?.id).toBe('brunette')
  expect(choosePack(packs, 'socratic', 'missing', 'meshy')?.id).toBe('meshy')
  expect(choosePack(packs, 'socratic', null, null)?.id).toBe('brunette')
  expect(choosePack([pack('brunette', ['socratic'])], 'ce', null, null)).toBeNull()
})

test('Chinese text opens the mouth once per character and pauses at punctuation', () => {
  const plan = planSpeech('你好。我們')
  expect(plan.charAt).toHaveLength(5)
  const spoken = plan.events.filter(e => e.viseme !== 'sil')
  expect(spoken).toHaveLength(8) // 四個字 × （聲母＋韻母）
  expect(plan.charAt[3] - plan.charAt[2]).toBeGreaterThan(plan.charAt[1] - plan.charAt[0]) // 句號停頓
  expect(() => timeline(plan.events.map(e => ({ viseme: e.viseme, timeMs: e.timeMs })), plan.durationMs)).not.toThrow()
})

test('English words map letters to distinct visemes', () => {
  const plan = planSpeech('Think about it')
  const visemes = plan.events.map(e => e.viseme)
  expect(visemes).toContain('TH')
  expect(visemes).toContain('aa')
  expect(visemes).toContain('PP')
  expect(visemes.every(v => VISEMES.includes(v))).toBe(true)
  expect(plan.charAt).toHaveLength('Think about it'.length)
})

test('a faster rate shortens the timeline', () => {
  expect(planSpeech('慢慢說', 2).durationMs).toBeLessThan(planSpeech('慢慢說', 1).durationMs)
})

test('without browser speech the mouth still moves and the end is reported', () => {
  jest.useFakeTimers()
  const calls: string[] = []
  const speaker = {
    speakTimeline: () => calls.push('start'),
    alignSpeech: () => calls.push('align'),
    stopSpeech: () => calls.push('stop'),
  }
  const onEnd = jest.fn()
  speak('你好', speaker, { onEnd })
  expect(calls).toEqual(['start'])
  jest.runAllTimers()
  expect(onEnd).toHaveBeenCalled()
  jest.useRealTimers()
})

test('the group stage speaks only the latest tutor line', () => {
  const transcript = [
    { messages: [{ role: 'tutor', text: '第一問' }, { role: 'student', text: '答' }] },
    { messages: [{ role: 'tutor', text: '第二問' }] },
  ]
  expect(lastTutorLine(transcript)).toEqual({ id: '1-0', text: '第二問' })
  expect(lastTutorLine([])).toBeNull()
})
