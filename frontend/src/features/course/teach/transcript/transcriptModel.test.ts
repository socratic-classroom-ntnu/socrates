import { attempt, completed, confirming, message, scenario, summary, T0, talking, transcript, unconfirmed } from './transcriptFixtures'
import { buildChat, buildTrack, finalFeedback, isStopped, messageIds, scenarioName, stageOf, stopKind } from './transcriptModel'

const kinds = (items: ReturnType<typeof buildChat>) => items.map(item => item.kind)

describe('buildChat', () => {
  test('a scenario starts with its label and the messages follow in order', () => {
    const items = buildChat(attempt({ messages: [message('m1', 'student', 'a', T0), message('m2', 'tutor', 'b', T0 + 1)] }))
    expect(kinds(items)).toEqual(['scenario', 'message', 'message'])
    expect(items[0]).toMatchObject({ kind: 'scenario', index: 0, name: '一輛失控的電車即將撞上五名工人' })
  })

  test('a press of 不太對 sits between the messages it falls between, with the reason chosen after it', () => {
    const items = buildChat(talking())
    expect(kinds(items)).toEqual(['scenario', 'message', 'message', 'message', 'message', 'reject', 'message'])
    expect(items[5]).toMatchObject({ kind: 'reject', scenario: 0, reason: 'reason' })
  })

  test.each([
    ['stance', 'stance'], ['reason', 'reason'], ['condition', 'condition'], ['changed_mind', 'changedMind'],
  ] as const)('the reason %s is worded as %s', (hint, reason) => {
    const a = attempt({
      scenarios: [scenario(0, { rejected_at: [T0 + 10] })],
      messages: [message('m1', 'student', 'x', T0), message('m2', 'student', 'y', T0 + 20, { revise_hint: hint })],
    })
    expect(buildChat(a)[2]).toMatchObject({ kind: 'reject', reason })
  })

  test('a reason is optional, and a press with no sentence after it has none', () => {
    const noHint = attempt({ scenarios: [scenario(0, { rejected_at: [T0 + 10] })], messages: [message('m1', 'student', 'x', T0), message('m2', 'student', 'y', T0 + 20)] })
    expect(buildChat(noHint)[2]).toMatchObject({ kind: 'reject', reason: null })
    const unsent = attempt({ scenarios: [scenario(0, { rejected_at: [T0 + 10] })], messages: [message('m1', 'student', 'x', T0)] })
    const items = buildChat(unsent)
    expect(kinds(items)).toEqual(['scenario', 'message', 'reject'])
    expect(items[2]).toMatchObject({ reason: null })
  })

  test('the count of presses is the count of lines, never the hints', () => {
    const a = attempt({
      scenarios: [scenario(0, { rejected_at: [T0 + 10, T0 + 30] })],
      messages: [message('m1', 'student', 'x', T0), message('m2', 'student', 'y', T0 + 20), message('m3', 'student', 'z', T0 + 40)],
    })
    expect(buildChat(a).filter(item => item.kind === 'reject')).toHaveLength(2)
  })

  test('presses are never lost when the times are not in order', () => {
    const a = attempt({ scenarios: [scenario(0, { rejected_at: [T0 + 30, T0 + 10] })], messages: [message('m1', 'student', 'x', T0)] })
    expect(buildChat(a).filter(item => item.kind === 'reject')).toHaveLength(2)
  })

  test('each reached scenario has its own label, and its presses stay with it', () => {
    const items = buildChat(confirming())
    const labels = items.filter(item => item.kind === 'scenario')
    expect(labels.map(item => item.kind === 'scenario' && item.index)).toEqual([0, 1])
    const firstRejectAt = items.findIndex(item => item.kind === 'reject')
    const secondLabelAt = items.findIndex(item => item.kind === 'scenario' && item.index === 1)
    expect(firstRejectAt).toBeGreaterThan(0)
    expect(firstRejectAt).toBeLessThan(secondLabelAt)
  })

  test('confirming adds the waiting summary then the system line, and only now', () => {
    const items = buildChat(confirming())
    expect(kinds(items).slice(-2)).toEqual(['pending', 'confirm'])
    expect(items.find(item => item.kind === 'pending')).toMatchObject({ capped: false })
    expect(buildChat(attempt({ messages: [] })).some(item => item.kind === 'confirm')).toBe(false)
    // A scenario confirmed earlier gets no such line.
    expect(buildChat(completed()).some(item => item.kind === 'confirm')).toBe(false)
  })

  test('a summary waiting after the messages ran out is marked capped', () => {
    expect(buildChat(confirming(true)).find(item => item.kind === 'pending')).toMatchObject({ capped: true })
  })

  test('running out of messages ends with its own system line and no summary', () => {
    const items = buildChat(attempt({ state: 'budget_exhausted', messages: [message('m1', 'student', 'x', T0)] }))
    expect(kinds(items).slice(-1)).toEqual(['budget'])
    expect(items.some(item => item.kind === 'pending')).toBe(false)
  })

  test('the sentences on a final summary come after the scenarios, each with its own system line', () => {
    const items = buildChat(unconfirmed())
    const tail = kinds(items).slice(-5)
    expect(tail).toEqual(['rejectFinal', 'message', 'rejectFinal', 'message', 'review'])
    // They are not part of the second scenario's talk.
    const second = items.findIndex(item => item.kind === 'scenario' && item.index === 1)
    expect(items.slice(second, items.findIndex(item => item.kind === 'rejectFinal')).filter(item => item.kind === 'message')).toHaveLength(1)
  })

  test.each(['reviewing', 'awaiting_reflection_prompt', 'reflecting', 'completed'] as const)('%s adds the review section', state => {
    expect(buildChat(attempt({ state })).some(item => item.kind === 'review')).toBe(true)
  })

  test('messageIds is the student and Socrates messages only', () => {
    const items = buildChat(talking())
    expect(messageIds(items)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5'])
  })
})

describe('scenarioName', () => {
  test('is the first sentence, cut short', () => {
    expect(scenarioName('一輛失控的電車即將撞上五名工人。你會拉嗎？')).toBe('一輛失控的電車即將撞上五名工人')
    expect(scenarioName('這是一個非常非常長而且沒有標點符號的情境描述會被截斷')).toBe('這是一個非常非常長而且沒有標點符…')
    expect(scenarioName('')).toBe('')
  })
})

describe('buildTrack', () => {
  test('one row per reached scenario, the current one marked', () => {
    const rows = buildTrack(confirming())
    expect(rows.map(row => [row.index, row.current])).toEqual([[0, false], [1, true]])
    expect(rows[0]).toMatchObject({ status: 'confirmed', stance: '不拉拉桿', stanceBlank: false, rejections: 1 })
  })

  test('a scenario still being talked over has no stance yet', () => {
    expect(buildTrack(talking())[0]).toMatchObject({ status: 'in_dialogue', stance: null, rejections: 1, turns: 2 })
  })

  test('confirming shows the position being discussed', () => {
    expect(buildTrack(confirming())[1]).toMatchObject({ status: 'confirming', stance: '不推陌生人', cappedConfirming: false })
  })

  test('confirming after running out of messages says so', () => {
    expect(buildTrack(confirming(true))[1]).toMatchObject({ status: 'confirming', cappedConfirming: true })
  })

  test('a scenario that ended capped shows no stance, even if a summary exists', () => {
    const a = attempt({
      scenarios: [scenario(0, { status: 'capped', confirmed_summary: summary() })],
      cells: [{ status: 'capped', turns: null }],
    })
    expect(buildTrack(a)[0]).toMatchObject({ status: 'capped', stance: null, stanceBlank: false })
  })

  test('a stance with no words is marked blank', () => {
    const a = attempt({ scenarios: [scenario(0, { status: 'goal_met', confirmed_summary: summary({ current_position: '  ' }) })], cells: [{ status: 'confirmed', turns: null }] })
    expect(buildTrack(a)[0]).toMatchObject({ stance: '  ', stanceBlank: true })
  })

  test('once the review has begun no scenario is the current one', () => {
    expect(buildTrack(completed()).some(row => row.current)).toBe(false)
  })

  test('scenarios not reached are not in the data, so not in the track', () => {
    expect(buildTrack(attempt()).map(row => row.index)).toEqual([0])
  })
})

describe('stageOf and stopping', () => {
  test('talking, confirming', () => {
    expect(stageOf(talking())).toEqual({ kind: 'cell', status: 'in_dialogue', turns: 2 })
    expect(stageOf(confirming())).toEqual({ kind: 'cell', status: 'confirming', turns: null })
  })

  test('the review says in the live page words whether it was confirmed', () => {
    expect(stageOf(attempt({ review_status: 'in_progress' }))).toEqual({ kind: 'review', key: 'inProgress' })
    expect(stageOf(completed())).toEqual({ kind: 'review', key: 'completed' })
    expect(stageOf(unconfirmed())).toEqual({ kind: 'review', key: 'unconfirmed' })
  })

  test('stops when the attempt is completed or the activity ended, and says which', () => {
    expect(isStopped(transcript({ attempt: talking() }))).toBe(false)
    expect(isStopped(transcript({ attempt: completed() }))).toBe(true)
    expect(isStopped(transcript({ attempt: talking(), status: 'ended' }))).toBe(true)
    expect(isStopped(transcript({ attempt: null, status: 'ended' }))).toBe(true)
    expect(stopKind(transcript({ attempt: completed() }))).toBe('completed')
    expect(stopKind(transcript({ attempt: unconfirmed() }))).toBe('unconfirmed')
    expect(stopKind(transcript({ attempt: talking(), status: 'ended' }))).toBe('ended')
    expect(stopKind(transcript({ attempt: talking() }))).toBeNull()
  })

  test('finalFeedback is the sentences on the final summary', () => {
    expect(finalFeedback(unconfirmed()).map(item => item.text)).toEqual(['第二個情境我其實還沒決定', '這樣寫還是不像我的想法'])
    expect(finalFeedback(talking())).toEqual([])
  })
})
