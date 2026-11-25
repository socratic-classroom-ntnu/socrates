import type { Attempt, Message, Scenario, Summary, Transcript } from './transcriptModel'

/** Fake data for the transcript page's tests: one student (小美) and the states of Figma 03–12. */
export const T0 = 1_800_000_000

export const summary = (over: Partial<Summary> = {}): Summary => ({
  current_position: '不拉拉桿', reason_summary: '主動讓人死亡，和沒能救人不一樣。', relevant_conditions: [],
  unresolved_issue: '', principle_note: '', sources: [], ...over,
})

export function message(id: string, role: 'student' | 'tutor', text: string, at: number, over: Partial<Message> = {}): Message {
  return { id, scenario_index: 0, role, text, created_at: at, move: role === 'tutor' ? 'probe' : null, revise_hint: null, final_feedback: false, locale: role === 'student' ? 'zh-Hant' : null, ...over }
}

export function scenario(index: number, over: Partial<Scenario> = {}): Scenario {
  const texts = ['一輛失控的電車即將撞上五名工人。你可以拉下拉桿，但那條軌道上有一名工人。你會拉嗎？', '你站在天橋上，旁邊有一位陌生人。你可以推他下去擋住電車。你會推嗎？', '手術室裡有五位病人各需要一個器官。你可以摘取一位健康病人的器官。你會嗎？']
  return {
    index, id: `s${index + 1}`, text: texts[index] ?? `第 ${index + 1} 個情境。`, change: null, answer: null, status: 'in_progress',
    confirmed_summary: null, rejected_at: [], first_message_id: null, stances: [], ...over,
  }
}

export function attempt(over: Partial<Attempt> = {}): Attempt {
  return {
    id: 'att-1', state: 'in_dialogue', scenario_index: 0, scenarios: [scenario(0)], messages: [], candidate_summary: null,
    revising: false, final_summary: null, final_status: null, final_revised: false, review_status: 'not_started',
    cells: [{ status: 'in_dialogue', turns: 2 }], ...over,
  }
}

export function transcript(over: { attempt?: Attempt | null; status?: Transcript['activity']['status']; student?: Partial<Transcript['student']> } = {}): Transcript {
  return {
    activity: { id: 'a-1', title: '第三週倫理討論', course_id: 'c-1', course_name: '科技倫理', status: over.status ?? 'open' },
    student: { enrollment_id: 'e-1', display_name: '小美', kind: 'registered', guest_number: null, last_activity_at: T0 + 1_920, ...over.student },
    attempt: over.attempt === undefined ? attempt() : over.attempt,
  }
}

/** 03: talking in the first scenario; the student turned a summary down once. */
export function talking(): Attempt {
  return attempt({
    scenarios: [scenario(0, { rejected_at: [T0 + 540], first_message_id: 'm1' })],
    messages: [
      message('m1', 'student', '我不會拉，因為拉了就是我讓那個人死的，雖然五個人比較多。', T0),
      message('m2', 'tutor', '如果你不拉，五個人會死。這時候「沒有動手」能讓你免除責任嗎？', T0 + 60),
      message('m3', 'student', '也不是完全沒責任…但主動造成跟沒能救，我覺得還是不一樣。', T0 + 180),
      message('m4', 'tutor', '你說「不一樣」，是哪裡不一樣？', T0 + 240),
      message('m5', 'student', '我想說的是，那個人本來是安全的，是我把危險轉給他。', T0 + 600, { revise_hint: 'reason' }),
    ],
  })
}

/** 06: the second scenario is waiting for the student's 對／不太對. */
export function confirming(capped = false): Attempt {
  return attempt({
    state: 'confirming', scenario_index: 1,
    scenarios: [
      scenario(0, { status: 'goal_met', confirmed_summary: summary(), rejected_at: [T0 + 540], first_message_id: 'a1' }),
      scenario(1, { status: capped ? 'capped' : 'in_progress', first_message_id: 'b1' }),
    ],
    messages: [
      message('a1', 'student', '我不會拉。', T0),
      message('a2', 'tutor', '為什麼？', T0 + 30),
      message('b1', 'student', '對，我在意他有沒有選擇。', T0 + 3_000, { scenario_index: 1 }),
      message('b2', 'tutor', '我先整理一下，這樣有說到你的想法嗎？', T0 + 3_060, { scenario_index: 1 }),
    ],
    candidate_summary: summary({ current_position: '不推陌生人', reason_summary: '不願把陌生人的身體當成救人的工具。', relevant_conditions: ['如果他自願，感受會不同'], unresolved_issue: '「同意」為什麼會改變判斷？', principle_note: '重視人的選擇與尊嚴。' }),
    cells: [{ status: 'confirmed', turns: null }, { status: 'confirming', turns: null }],
  })
}

/** 05: both scenarios confirmed and the final summary confirmed. */
export function completed(): Attempt {
  return attempt({
    state: 'completed', scenario_index: 1, review_status: 'completed', final_status: 'confirmed',
    scenarios: [
      scenario(0, { status: 'goal_met', confirmed_summary: summary(), rejected_at: [T0 + 540] }),
      scenario(1, { status: 'goal_met', confirmed_summary: summary({ current_position: '不推陌生人' }) }),
    ],
    messages: [message('a1', 'student', '我不會拉。', T0), message('b1', 'student', '我不會推。', T0 + 3_000, { scenario_index: 1 })],
    final_summary: {
      points: [{ text: '你認為主動害人和任其發生不一樣。', sources: [] }],
      trajectory: [{ position: '不拉拉桿', shift_reason: '', sources: [] }, { position: '不推陌生人', shift_reason: '更在意他是否被當成工具', sources: [] }],
      final_position: '我不願主動讓一個人死亡，來換取更多人的生命。', reasoning_style: '不能只把一個人當成達成目的的手段。', open_question: '不介入是否就能免除責任？', },
    cells: [{ status: 'confirmed', turns: null }, { status: 'confirmed', turns: null }],
  })
}

/** 08: the student turned the final summary down twice. */
export function unconfirmed(): Attempt {
  return {
    ...completed(), final_status: 'unconfirmed', final_summary: null, final_revised: true,
    messages: [
      ...completed().messages,
      message('f1', 'student', '第二個情境我其實還沒決定', T0 + 4_000, { scenario_index: 1, final_feedback: true }),
      message('f2', 'student', '這樣寫還是不像我的想法', T0 + 4_100, { scenario_index: 1, final_feedback: true }),
    ],
  }
}

/** 12: four scenarios reached, one student message of about 600 characters. */
export function longContent(): Attempt {
  const long = '我想了很久，還是覺得不能拉。不是因為我不在乎那五個工人，而是我覺得「讓事情發生」和「讓事情因為我發生」差很多。'.repeat(12)
  return attempt({
    state: 'in_dialogue', scenario_index: 3,
    scenarios: [
      scenario(0, { status: 'goal_met', confirmed_summary: summary(), rejected_at: [T0 + 540] }),
      scenario(1, { status: 'goal_met', confirmed_summary: summary({ current_position: '不推陌生人' }) }),
      scenario(2, { status: 'goal_met', confirmed_summary: summary({ current_position: '不摘取健康病人的器官' }) }),
      scenario(3, { text: '一位自願的捐贈者願意把器官給五位病人。你會同意嗎？' }),
    ],
    messages: [
      message('a1', 'student', '我不會拉。', T0),
      message('a2', 'tutor', '如果你不拉，五個人會死。這時候「沒有動手」能讓你免除責任嗎？', T0 + 60),
      message('d1', 'student', long, T0 + 9_000, { scenario_index: 3 }),
    ],
    cells: [{ status: 'confirmed', turns: null }, { status: 'confirmed', turns: null }, { status: 'confirmed', turns: null }, { status: 'in_dialogue', turns: 1 }],
  })
}
