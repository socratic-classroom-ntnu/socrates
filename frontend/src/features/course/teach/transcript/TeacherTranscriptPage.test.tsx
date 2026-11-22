import { act, fireEvent, screen, within } from '@testing-library/react'
import { ApiError, api } from '../../../../contract/classroomClient'
import { applyLocale } from '../../../../i18n'
import { mockApi, renderAt, signedInTeacher } from '../../../../testing/pageHarness'
import { TeacherTranscriptPage } from './TeacherTranscriptPage'
import { attempt, completed, confirming, longContent, message, scenario, summary, T0, talking, transcript, unconfirmed } from './transcriptFixtures'
import type { Transcript } from './transcriptModel'

jest.mock('../../../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../../../contract/classroomClient')>('../../../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

const KEY = 'GET /solo/activities/a-1/students/e-1/attempt'

function open(data: Transcript | (() => Transcript | Promise<Transcript>), locale: 'zh-Hant' | 'en' | 'es' | 'zh-Hans' = 'zh-Hant') {
  const calls = mockApi({ 'GET /auth/me': { ...signedInTeacher, locale }, [KEY]: typeof data === 'function' ? data : () => data })
  renderAt('/teach/activities/a-1/students/e-1', '/teach/activities/:activityId/students/:enrollmentId', <TeacherTranscriptPage />)
  return calls
}

beforeEach(() => jest.mocked(api).mockReset())
afterEach(() => { jest.useRealTimers(); applyLocale('zh-Hant') })

const page = () => screen.findByTestId('teacher-transcript-page')
const chat = async () => within(await page()).findByRole('region', { name: '小美 與蘇格拉底的對話（唯讀）' })
const track = async () => within(await page()).findByRole('complementary', { name: '小美的立場軌跡' })

describe('the page', () => {
  test('header: breadcrumb with three links, the activity as title, and the way back', async () => {
    open(transcript({ attempt: talking() }))
    const view = await page()
    const crumb = within(view).getByRole('navigation', { name: '頁面路徑' })
    expect(within(crumb).getByRole('link', { name: '我教的課' })).toHaveAttribute('href', '/?tab=teach')
    expect(await within(crumb).findByRole('link', { name: '科技倫理' })).toHaveAttribute('href', '/teach/courses/c-1')
    expect(within(crumb).getByRole('link', { name: '第三週倫理討論' })).toHaveAttribute('href', '/teach/activities/a-1')
    expect(within(crumb).getByText('即時狀況')).not.toHaveAttribute('href')
    expect(within(view).getByRole('heading', { level: 1, name: '第三週倫理討論' })).toBeInTheDocument()
    expect(within(view).getByRole('link', { name: '回到即時狀況' })).toHaveAttribute('href', '/teach/activities/a-1')
  })

  test('the student is named only in the chat header, never in the page header', async () => {
    open(transcript({ attempt: talking() }))
    const view = await page()
    const c = await chat()
    expect(view.querySelector('.transcript-head')).not.toHaveTextContent('小美')
    expect(within(c).getByRole('heading', { name: '小美 與蘇格拉底' })).toBeInTheDocument()
  })
})

describe('03 talking: the chat reads like a chat', () => {
  test('scenario label, the blackboard, student bubbles with a time and no name, Socrates with a name', async () => {
    open(transcript({ attempt: talking() }))
    const c = await chat()
    expect(within(c).getByText('情境 1 · 一輛失控的電車即將撞上五名工人')).toBeInTheDocument()
    expect(within(c).getByRole('region', { name: '老師給的情境' })).toHaveTextContent('你可以拉下拉桿')
    const student = within(c).getByText('我不會拉，因為拉了就是我讓那個人死的，雖然五個人比較多。')
    expect(student).toHaveClass('tc-bubble--student')
    const row = student.closest('.tc-row') as HTMLElement
    expect(row).toHaveClass('tc-row--student')
    expect(within(row).getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument()
    expect(row).not.toHaveTextContent('小美的')
    expect(row.querySelector('.tc-avatar')).toHaveTextContent('小')
    const tutor = within(c).getByText('如果你不拉，五個人會死。這時候「沒有動手」能讓你免除責任嗎？')
    expect(tutor.closest('.tc-row')).toHaveClass('tc-row--tutor')
    expect(within(tutor.closest('.tc-row') as HTMLElement).getByText('蘇格拉底')).toBeInTheDocument()
  })

  test('the status pill uses the live page words, the footer the last action', async () => {
    open(transcript({ attempt: talking() }))
    const c = await chat()
    expect(within(c).getByText('對話中 · 2 輪')).toHaveClass('live-cell--in_dialogue')
    expect(c.querySelector('.transcript-chat__foot')).toHaveTextContent(/^最後動作 \d{2}:\d{2} · 每 10 秒更新$/)
  })

  test('no banner while it is simply going on', async () => {
    open(transcript({ attempt: talking() }))
    await page()
    expect(screen.queryByRole('status')).toBeNull()
  })

  test('a long message wraps inside its bubble', async () => {
    const long = '我想了很久，'.repeat(100)
    open(transcript({ attempt: attempt({ messages: [message('m1', 'student', long, T0)] }) }))
    const bubble = within(await chat()).getByText(long)
    expect(bubble).toHaveClass('tc-bubble')
    expect(bubble.textContent).toBe(long)
  })
})

describe('system lines', () => {
  test('a press of 不太對 with the reason the student chose', async () => {
    open(transcript({ attempt: talking() }))
    const line = within(await chat()).getByText('小美按「不太對」（理由不太對）')
    expect(line.closest('.tc-system')).toHaveTextContent('系統：小美按「不太對」（理由不太對）')
    expect(within(line.closest('.tc-system') as HTMLElement).getByText('系統：').tagName).toBe('STRONG')
  })

  test('without a reason, or before the next sentence, there are no brackets', async () => {
    const noHint = attempt({ scenarios: [scenario(0, { rejected_at: [T0 + 10] })], messages: [message('m1', 'student', 'x', T0), message('m2', 'student', 'y', T0 + 20)] })
    open(transcript({ attempt: noHint }))
    expect(await within(await chat()).findByText('小美按「不太對」')).toBeInTheDocument()
    expect(screen.queryByText(/（.*不太對）/)).toBeNull()
  })

  test.each([
    ['stance', '立場不太對'], ['condition', '條件不太對'], ['changed_mind', '我其實改變想法了'],
  ] as const)('the reason %s reads %s', async (hint, words) => {
    const a = attempt({ scenarios: [scenario(0, { rejected_at: [T0 + 10] })], messages: [message('m1', 'student', 'x', T0), message('m2', 'student', 'y', T0 + 20, { revise_hint: hint })] })
    open(transcript({ attempt: a }))
    expect(await within(await chat()).findByText(`小美按「不太對」（${words}）`)).toBeInTheDocument()
  })

  test('two presses make two lines, the count of presses and not of hints', async () => {
    const a = attempt({ scenarios: [scenario(0, { rejected_at: [T0 + 10, T0 + 30] })], messages: [message('m1', 'student', 'x', T0), message('m2', 'student', 'y', T0 + 20), message('m3', 'student', 'z', T0 + 40)] })
    open(transcript({ attempt: a }))
    const c = await chat()
    expect(within(c).getAllByText(/^小美按「不太對」$/)).toHaveLength(2)
  })

  test('a press on the final summary is a line with no brackets, and the sentence follows it', async () => {
    open(transcript({ attempt: unconfirmed() }))
    const c = await chat()
    const lines = c.querySelectorAll('.tc-system')
    expect(Array.from(lines).map(line => line.textContent)).toEqual(expect.arrayContaining(['系統：小美按「不太對」']))
    const sentence = within(c).getAllByText('第二個情境我其實還沒決定')[0]
    expect(sentence.closest('.tc-row')?.previousElementSibling).toHaveClass('tc-system')
  })

  test('confirming ends the chat with a line asking the student to confirm', async () => {
    open(transcript({ attempt: confirming() }))
    const c = await chat()
    const last = c.querySelector('.transcript-chat__scroll')?.lastElementChild
    expect(last).toHaveTextContent('系統：請小美確認觀點')
  })

  test('a scenario confirmed earlier gets no such line', async () => {
    open(transcript({ attempt: completed() }))
    expect(within(await chat()).queryByText(/請小美確認觀點/)).toBeNull()
  })

  test('running out of messages is a grey line at the end', async () => {
    open(transcript({ attempt: attempt({ state: 'budget_exhausted', messages: [message('m1', 'student', 'x', T0)] }) }))
    const c = await chat()
    expect(c.querySelector('.transcript-chat__scroll')?.lastElementChild).toHaveTextContent('系統：小美的訊息額度用完了')
    expect(within(c).queryByRole('region', { name: '目前的觀點摘要' })).toBeNull()
  })
})

describe('06 / 07 confirming', () => {
  test('06: the summary waiting for the student is shown and marked so', async () => {
    open(transcript({ attempt: confirming() }))
    const card = within(await chat()).getByRole('region', { name: '目前的觀點摘要' })
    expect(within(card).getByText('待學生確認')).toBeInTheDocument()
    expect(within(card).getByText('僅整理情境 2 的目前觀點，尚未經學生確認。')).toBeInTheDocument()
    expect(within(card).getByText('不推陌生人')).toBeInTheDocument()
    expect(within(card).getByText('不願把陌生人的身體當成救人的工具。')).toBeInTheDocument()
    expect(within(card).getByText('如果他自願，感受會不同')).toBeInTheDocument()
    expect(within(card).getByText('「同意」為什麼會改變判斷？')).toBeInTheDocument()
    expect(within(card).getByText('重視人的選擇與尊嚴。')).toBeInTheDocument()
    expect(within(await chat()).getByText('確認觀點中', { selector: '.transcript-chat__head .live-cell' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).toBeNull()
  })

  test('06: the track says the student is yet to confirm and what is being discussed', async () => {
    open(transcript({ attempt: confirming() }))
    const t = await track()
    expect(within(t).getByText('尚待小美確認')).toBeInTheDocument()
    expect(within(t).getByText('目前討論：不推陌生人')).toBeInTheDocument()
    expect(within(t).getByText('1 / 2 個情境已確認')).toBeInTheDocument()
  })

  test('07: out of messages, the banner and the track say so', async () => {
    open(transcript({ attempt: confirming(true) }))
    expect(await screen.findByRole('status')).toHaveTextContent('已達訊息數上限 · 對話已停止 · 等待學生確認目前摘要')
    const t = await track()
    expect(within(t).getByText('到上限才結束')).toBeInTheDocument()
    expect(within(t).getByText(/尚待小美確認，非一般完成/)).toBeInTheDocument()
    expect(within(await chat()).getByRole('region', { name: '目前的觀點摘要' })).toBeInTheDocument()
  })

  test('a summary still blank in a field says so in grey', async () => {
    const a = confirming(true)
    open(transcript({ attempt: { ...a, candidate_summary: { ...a.candidate_summary!, current_position: '', reason_summary: '' } } }))
    const card = within(await chat()).getByRole('region', { name: '目前的觀點摘要' })
    expect(within(card).getAllByText('（還沒說明）')).toHaveLength(2)
    expect(within(card).getAllByText('（還沒說明）')[0]).toHaveClass('tc-blank')
  })
})

describe('05 completed and 08 ended unconfirmed', () => {
  test('05: the confirmed final summary, the banner, and the footer', async () => {
    open(transcript({ attempt: completed() }))
    expect(await screen.findByRole('status')).toHaveTextContent('本次對話已完成 · 內容已保留 · 不再自動更新')
    const c = await chat()
    const card = within(c).getByRole('region', { name: '最終整理' })
    expect(within(card).getByText('✓ 已確認')).toBeInTheDocument()
    expect(within(card).getByText('我不願主動讓一個人死亡，來換取更多人的生命。')).toBeInTheDocument()
    expect(within(c).getByText('已完成', { selector: '.transcript-chat__head .live-cell' })).toBeInTheDocument()
    expect(c.querySelector('.transcript-chat__foot')).toHaveTextContent(/^最後動作 \d{2}:\d{2} · 已完成$/)
  })

  test('08: nothing of the unconfirmed summary, only the confirmed scenarios and what the student wrote', async () => {
    const a = unconfirmed()
    open(transcript({ attempt: { ...a, final_summary: null } }))
    expect(await screen.findByRole('status')).toHaveTextContent('最終整理未確認 · 不再自動更新')
    const c = await chat()
    expect(within(c).queryByRole('region', { name: '最終整理' })).toBeNull()
    expect(within(c).getByText('各情境已確認摘要')).toBeInTheDocument()
    expect(within(c).getAllByText('✓ 已確認')).toHaveLength(2)
    expect(within(c).getByText('第 1 次確認 · 學生選擇「不太對」：「第二個情境我其實還沒決定」')).toBeInTheDocument()
    expect(within(c).getByText('第 2 次確認 · 學生選擇「不太對」：「這樣寫還是不像我的想法」')).toBeInTheDocument()
    expect(within(c).getByText('最終整理未獲學生確認。')).toBeInTheDocument()
    expect(within(c).getByText('已完成・未確認', { selector: '.transcript-chat__head .live-cell' })).toBeInTheDocument()
    expect(c.querySelector('.transcript-chat__foot')).toHaveTextContent(/未確認結束$/)
  })

  test('a finished attempt without a final summary says so', async () => {
    const a = completed()
    open(transcript({ attempt: { ...a, final_summary: null } }))
    expect(await within(await chat()).findByText('學生沒有產生最終整理。')).toBeInTheDocument()
  })

  test('a summary the student is still reading is shown as waiting', async () => {
    open(transcript({ attempt: { ...completed(), state: 'reflecting', review_status: 'in_progress', final_status: null } }))
    const card = within(await chat()).getByRole('region', { name: '最終整理' })
    expect(within(card).getByText('待學生確認')).toBeInTheDocument()
  })
})

describe('the stance track', () => {
  test('one stop per reached scenario, with its stance and how often 不太對 was pressed', async () => {
    open(transcript({ attempt: completed() }))
    const t = await track()
    expect(within(t).getAllByRole('listitem')).toHaveLength(3)
    expect(within(t).getByText('不拉拉桿')).toBeInTheDocument()
    expect(within(t).getByText('不太對 1 次')).toBeInTheDocument()
    expect(within(t).queryByText(/不太對 [02-9] 次/)).toBeNull()
    expect(within(t).getByText('2 / 2 個情境已確認')).toBeInTheDocument()
  })

  test('a scenario still being talked over has no stance yet', async () => {
    open(transcript({ attempt: talking() }))
    const t = await track()
    expect(within(t).getByText('還沒整理出立場')).toBeInTheDocument()
    expect(within(t).getByText('對話中 · 2 輪')).toBeInTheDocument()
  })

  test('a scenario that ended capped shows only the tag, never a stance', async () => {
    const a = attempt({
      state: 'between_scenarios', scenarios: [scenario(0, { status: 'capped', confirmed_summary: null })], cells: [{ status: 'capped', turns: null }],
      candidate_summary: null,
    })
    open(transcript({ attempt: a }))
    const t = await track()
    expect(within(t).getByText('尚未釐清')).toHaveClass('live-cell--capped')
    expect(within(t).queryByText('還沒整理出立場')).toBeNull()
  })

  test('scenarios the student has not reached are not there', async () => {
    open(transcript({ attempt: talking() }))
    expect(within(await track()).getAllByRole('listitem')).toHaveLength(1)
  })

  test('the review is the last stop once it has begun, in the live page words', async () => {
    open(transcript({ attempt: completed() }))
    const t = await track()
    const last = within(t).getAllByRole('listitem').at(-1) as HTMLElement
    expect(within(last).getByText('回顧與反思')).toBeInTheDocument()
    expect(within(last).getByText('已完成')).toBeInTheDocument()
    expect(within(last).getByText('最終整理已確認')).toBeInTheDocument()
  })

  test('an unconfirmed ending is worded as in the live page', async () => {
    open(transcript({ attempt: unconfirmed() }))
    const last = within(await track()).getAllByRole('listitem').at(-1) as HTMLElement
    expect(within(last).getByText('已完成・未確認')).toBeInTheDocument()
    expect(within(last).getByText('最終整理學生否決 2 次，結果未確認')).toBeInTheDocument()
  })

  // jsdom has no Element.scrollTo, so each test puts one on the scroller and reads what it was asked to do
  async function clickSecondStop() {
    open(transcript({ attempt: confirming() }))
    const c = await chat()
    const scroll = within(c).getByTestId('transcript-scroll')
    const scrollTo = jest.fn()
    scroll.scrollTo = scrollTo
    const second = c.querySelector('[data-scenario="1"]') as HTMLElement
    Object.defineProperty(second, 'offsetTop', { configurable: true, value: 640 })
    fireEvent.click(within(await track()).getByRole('button', { name: /捲到情境 2 的開頭/ }))
    return scrollTo
  }

  test('clicking a stop scrolls the chat smoothly to the start of that scenario', async () => {
    expect(await clickSecondStop()).toHaveBeenCalledWith({ top: 640 - 12, behavior: 'smooth' })
  })

  test('a reader who asked for less motion gets the jump without the animation', async () => {
    const original = window.matchMedia
    // setupTests defines matchMedia with defineProperty, so it is replaced the same way
    const set = (value: typeof window.matchMedia) => Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value })
    set(((query: string) => ({ ...original(query), matches: query.includes('prefers-reduced-motion') })) as typeof window.matchMedia)
    try {
      expect(await clickSecondStop()).toHaveBeenCalledWith({ top: 640 - 12, behavior: 'auto' })
    } finally {
      set(original)
    }
  })
})

describe('09 not started, 10 loading, 11 failed', () => {
  test('09: no conversation, with the way back', async () => {
    open(transcript({ attempt: null }))
    expect(await screen.findByText('目前沒有對話紀錄')).toBeInTheDocument()
    expect(screen.getByText('這位學生尚未開始本次活動，開始後即可在此查看對話內容。')).toBeInTheDocument()
    const view = await page()
    expect(within(view).getAllByRole('link', { name: '回到即時狀況' })).toHaveLength(2)
    expect(within(view).getByRole('heading', { level: 1, name: '第三週倫理討論' })).toBeInTheDocument()
  })

  test('10: loading, with a generic title until the activity is known', async () => {
    let release: (value: Transcript) => void = () => undefined
    open(() => new Promise<Transcript>(resolve => { release = resolve }))
    expect(await screen.findByText('正在載入對話紀錄……')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: '完整對話' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull()
    await act(async () => { release(transcript({ attempt: talking() })) })
    expect(await chat()).toBeInTheDocument()
  })

  test('11: a failed first load offers retry and the way back, and retry reads again', async () => {
    let fail = true
    const calls = open(() => { if (fail) throw new ApiError(500, { detail: 'X' }); return transcript({ attempt: talking() }) })
    expect(await screen.findByText('無法載入對話紀錄')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: '回到即時狀況' }).length).toBeGreaterThan(0)
    fail = false
    fireEvent.click(screen.getByRole('button', { name: '重試' }))
    expect(await chat()).toBeInTheDocument()
    expect(calls.filter(call => call.key === KEY).length).toBeGreaterThanOrEqual(2)
  })

  test('11: a 404 (wrong address, no permission) has only the way back', async () => {
    open(() => { throw new ApiError(404, { detail: 'ACTIVITY_NOT_FOUND' }) })
    expect(await screen.findByText('無法載入對話紀錄')).toBeInTheDocument()
    expect(screen.getByText('找不到這份對話紀錄，或你沒有查看的權限。')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '重試' })).toBeNull()
    expect(screen.getAllByRole('link', { name: '回到即時狀況' }).length).toBeGreaterThan(0)
  })
})

describe('12 long content', () => {
  test('four stops in the track, and a 600-character message stays in one bubble', async () => {
    open(transcript({ attempt: longContent() }))
    const t = await track()
    expect(within(t).getAllByRole('listitem')).toHaveLength(4)
    expect(within(t).getByText('不太對 1 次')).toBeInTheDocument()
    expect(within(t).getByText('不摘取健康病人的器官')).toBeInTheDocument()
    expect(within(t).getByText('還沒整理出立場')).toBeInTheDocument()
    const bubbles = Array.from((await chat()).querySelectorAll('.tc-bubble--student'))
    const longest = bubbles.map(bubble => bubble.textContent ?? '').sort((a, b) => b.length - a.length)[0]
    expect(longest.length).toBeGreaterThanOrEqual(600)
    expect(within(await chat()).getAllByText(/^情境 \d/)).toHaveLength(4)
  })
})

describe('refreshing', () => {
  const reads = (calls: { key: string }[]) => calls.filter(call => call.key === KEY).length

  test('reads again every ten seconds', async () => {
    jest.useFakeTimers()
    const calls = open(transcript({ attempt: talking() }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(reads(calls)).toBe(1)
    await act(async () => { jest.advanceTimersByTime(10_000); await Promise.resolve() })
    expect(reads(calls)).toBe(2)
  })

  test('stops once the attempt is completed', async () => {
    jest.useFakeTimers()
    const calls = open(transcript({ attempt: completed() }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => { jest.advanceTimersByTime(60_000); await Promise.resolve() })
    expect(reads(calls)).toBe(1)
  })

  test('stops once the activity has ended, and the footer says so', async () => {
    jest.useFakeTimers()
    const calls = open(transcript({ attempt: talking(), status: 'ended' }))
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    await act(async () => { jest.advanceTimersByTime(60_000); await Promise.resolve() })
    expect(reads(calls)).toBe(1)
    expect((await chat()).querySelector('.transcript-chat__foot')).toHaveTextContent(/活動已結束$/)
    expect(await screen.findByRole('status')).toHaveTextContent('活動已結束 · 不再自動更新')
  })

  test('a student who has not started is still watched, and appears when they begin', async () => {
    jest.useFakeTimers()
    let current: Transcript = transcript({ attempt: null })
    open(() => current)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByText('目前沒有對話紀錄')).toBeInTheDocument()
    current = transcript({ attempt: talking() })
    await act(async () => { jest.advanceTimersByTime(10_000); await Promise.resolve(); await Promise.resolve() })
    expect(screen.queryByText('目前沒有對話紀錄')).toBeNull()
    expect(screen.getByRole('region', { name: '小美 與蘇格拉底的對話（唯讀）' })).toBeInTheDocument()
  })

  test('a refresh that fails keeps what is on screen and the next one tries again', async () => {
    jest.useFakeTimers()
    let fail = false
    const calls = open(() => { if (fail) throw new ApiError(500, { detail: 'X' }); return transcript({ attempt: talking() }) })
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    fail = true
    await act(async () => { jest.advanceTimersByTime(10_000); await Promise.resolve(); await Promise.resolve() })
    expect(screen.getByRole('region', { name: '小美 與蘇格拉底的對話（唯讀）' })).toBeInTheDocument()
    expect(screen.queryByText('無法載入對話紀錄')).toBeNull()
    fail = false
    await act(async () => { jest.advanceTimersByTime(10_000); await Promise.resolve() })
    expect(reads(calls)).toBe(3)
  })
})

describe('scrolling while it refreshes', () => {
  function geometry(element: HTMLElement, state: { top: number; height: number; client: number }) {
    Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => state.height })
    Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => state.client })
    Object.defineProperty(element, 'scrollTop', { configurable: true, get: () => state.top, set: value => { state.top = value } })
  }

  async function openAndTick(first: Transcript, second: Transcript) {
    jest.useFakeTimers()
    let current = first
    open(() => current)
    await act(async () => { await Promise.resolve(); await Promise.resolve() })
    const scroll = (await chat()).querySelector('.transcript-chat__scroll') as HTMLElement
    const state = { top: 600, height: 1000, client: 400 }
    geometry(scroll, state)
    const next = async () => {
      current = second
      await act(async () => { jest.advanceTimersByTime(10_000); await Promise.resolve(); await Promise.resolve() })
    }
    return { scroll, state, next }
  }

  const more = (base: Transcript): Transcript => ({
    ...base, attempt: { ...base.attempt!, messages: [...base.attempt!.messages, message('m6', 'tutor', '新的追問', T0 + 700), message('m7', 'student', '新的回答', T0 + 760)] },
  })

  test('at the bottom, new messages carry the view down and there is no pill', async () => {
    const first = transcript({ attempt: talking() })
    const { state, next } = await openAndTick(first, more(first))
    state.top = 600 // 1000 − 600 − 400 = 0 from the bottom
    fireEvent.scroll(screen.getByTestId('transcript-scroll'))
    state.height = 1200
    await next()
    expect(state.top).toBe(1200)
    expect(screen.queryByRole('button', { name: /則新內容/ })).toBeNull()
  })

  test('scrolled up, the view stays where it is and a pill counts the new messages', async () => {
    const first = transcript({ attempt: talking() })
    const { state, next } = await openAndTick(first, more(first))
    state.top = 100 // far from the bottom
    fireEvent.scroll(screen.getByTestId('transcript-scroll'))
    state.height = 1200
    await next()
    expect(state.top).toBe(100)
    expect(screen.getByRole('button', { name: '↓ 有 2 則新內容' })).toBeInTheDocument()
  })

  test('at the bottom, a card or system line that arrives with no new message still carries the view down', async () => {
    const first = transcript({ attempt: talking() })
    const second: Transcript = { ...first, attempt: { ...first.attempt!, state: 'confirming', candidate_summary: summary(), cells: [{ status: 'confirming', turns: null }] } }
    const { state, next } = await openAndTick(first, second)
    state.top = 600
    fireEvent.scroll(screen.getByTestId('transcript-scroll'))
    state.height = 1200
    await next()
    expect(state.top).toBe(1200)
  })

  test('the pill counts only the student and Socrates messages, not system lines', async () => {
    const first = transcript({ attempt: talking() })
    const second = more(first)
    second.attempt!.scenarios = [{ ...second.attempt!.scenarios[0], rejected_at: [...second.attempt!.scenarios[0].rejected_at, T0 + 710] }]
    const { state, next } = await openAndTick(first, second)
    state.top = 100
    fireEvent.scroll(screen.getByTestId('transcript-scroll'))
    await next()
    expect(screen.getByRole('button', { name: '↓ 有 2 則新內容' })).toBeInTheDocument()
  })

  test('clicking the pill goes to the bottom and clears it', async () => {
    const first = transcript({ attempt: talking() })
    const { state, next } = await openAndTick(first, more(first))
    state.top = 100
    fireEvent.scroll(screen.getByTestId('transcript-scroll'))
    state.height = 1200
    await next()
    fireEvent.click(screen.getByRole('button', { name: '↓ 有 2 則新內容' }))
    expect(state.top).toBe(1200)
    expect(screen.queryByRole('button', { name: /則新內容/ })).toBeNull()
  })

  test('scrolling back to the bottom clears it too', async () => {
    const first = transcript({ attempt: talking() })
    const { state, next } = await openAndTick(first, more(first))
    state.top = 100
    fireEvent.scroll(screen.getByTestId('transcript-scroll'))
    state.height = 1200
    await next()
    expect(screen.getByRole('button', { name: /則新內容/ })).toBeInTheDocument()
    state.top = 1200 - 400 - 50 // within 96px of the bottom
    fireEvent.scroll(screen.getByTestId('transcript-scroll'))
    expect(screen.queryByRole('button', { name: /則新內容/ })).toBeNull()
  })

  test('the track updates without moving the chat', async () => {
    const first = transcript({ attempt: talking() })
    const second = transcript({ attempt: { ...confirming(), scenario_index: 0, scenarios: [confirming().scenarios[0]], cells: [{ status: 'confirmed', turns: null }], state: 'in_dialogue', candidate_summary: null } })
    const { state, next } = await openAndTick(first, second)
    state.top = 100
    fireEvent.scroll(screen.getByTestId('transcript-scroll'))
    await next()
    expect(state.top).toBe(100)
    expect(within(await track()).getByText('不拉拉桿')).toBeInTheDocument()
  })
})

describe('guests and languages', () => {
  test('an expired guest is named by number, as on the live page', async () => {
    open(transcript({ attempt: talking(), student: { display_name: '', kind: 'expired_guest', guest_number: 2 } }))
    const view = await page()
    expect(await within(view).findByRole('heading', { name: '過期訪客 2 與蘇格拉底' })).toBeInTheDocument()
    expect(within(view).getByText('過期訪客 2按「不太對」（理由不太對）')).toBeInTheDocument()
  })

  test.each([
    ['en' as const, 'Ana', 'Ana pressed "Not quite" (reason not quite right)', 'Ana and Socrates', 'Back to live status'],
    ['es' as const, 'Ana', 'Ana pulsó «No del todo» (el motivo no es del todo así)', 'Ana y Sócrates', 'Volver al estado en directo'],
    ['zh-Hans' as const, '小美', '小美按“不太对”（理由不太对）', '小美 与苏格拉底', '回到实时状况'],
  ])('%s: the page speaks that language', async (locale, name, line, heading, back) => {
    open(transcript({ attempt: talking(), student: { display_name: name } }), locale)
    const view = await page()
    expect(await within(view).findByText(line)).toBeInTheDocument()
    expect(within(view).getByRole('heading', { name: heading })).toBeInTheDocument()
    expect(within(view).getByRole('link', { name: back })).toBeInTheDocument()
  })
})

describe('reading the page without the Chinese punctuation', () => {
  test('the track button is named by what it shows, with the jump hint added', async () => {
    open(transcript({ attempt: confirming() }))
    const button = within(await track()).getByRole('button', { name: /捲到情境 1 的開頭/ })
    expect(button).toHaveAccessibleName(/情境 1.*不拉拉桿.*捲到情境 1 的開頭/)
  })

  test('English and Spanish use their own colon and separator', async () => {
    const a = confirming()
    a.candidate_summary = summary({ relevant_conditions: ['one', 'two'] })
    open(transcript({ attempt: a }), 'en')
    expect(await screen.findByText('one; two')).toBeInTheDocument()
  })

  test('the final summary words each trajectory step with the locale\'s colon', async () => {
    open(transcript({ attempt: completed() }), 'en')
    expect(await screen.findByText(/Scenario 1: 不拉拉桿/)).toBeInTheDocument()
    expect(screen.queryByText(/Scenario 1：/)).toBeNull()
  })
})
