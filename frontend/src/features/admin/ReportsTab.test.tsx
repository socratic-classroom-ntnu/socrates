import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { getEvalReport, getVoiceReport, type EvalReportView, type VoiceReportView } from '../../contract/classroomClient'
import { applyLocale } from '../../i18n'
import { useAuth } from '../auth/AuthContext'
import { AdminGate } from './AdminGate'
import { AdminPage } from './AdminPage'

jest.mock('../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../contract/classroomClient')>('../../contract/classroomClient')
  return { ApiError: actual.ApiError, getEvalReport: jest.fn(), getVoiceReport: jest.fn(), listToggles: jest.fn() }
})
jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))

const evals = getEvalReport as jest.Mock
const voice = getVoiceReport as jest.Mock
const me = { id: 'a-1', username: 'wang', kind: 'registered', verified: true, is_admin: true, account_role: 'teacher' }
const SCENARIO = '一輛失控的電車正駛向五名工人。'

const EVAL: EvalReportView = {
  scenario: SCENARIO,
  tutor_goal: '讓學生說出理由',
  days: 7,
  runs: 2,
  leaked: 0,
  totals: [
    { key: 'schema', rate: 1, count: 2 },
    { key: 'flags', rate: 0.75, count: 2 },
    { key: 'move', rate: 0.5, count: 2 },
    { key: 'check', rate: null, count: 0 },
    { key: 'language', rate: 1, count: 2 },
    { key: 'citations', rate: null, count: 0 },
  ],
  cases: [
    {
      id: 'normal-numbers', category: '一般作答', messages: ['我會拉桿，因為五個人比一個人多。'], locale: 'zh-Hant',
      runs: 2, schema: 1, move: 0.5, flags: 0.75, check: null, language: 1, leaked: 0, notes: [],
    },
    {
      id: 'lang-en', category: '多語', messages: ['I would pull the lever.'], locale: 'en',
      runs: 0, schema: null, move: null, flags: null, check: null, language: null, leaked: 0, notes: ['語言設定是 zh-Hant，這題要先切到 en'],
    },
  ],
}
const VOICE: VoiceReportView = {
  days: 7,
  costed: true,
  sessions: [{
    at: 1_763_533_920, username: 'qa-1', endpoint: 'solo.voice', model: 'voice-model',
    input_tokens: 1200, output_tokens: 800, audio_input_tokens: 1000, audio_output_tokens: 800, cost: 0.0132,
  }],
  totals: { sessions: 1, input_tokens: 1200, output_tokens: 800, cost: 0.0132 },
}

function renderReports() {
  return render(<MemoryRouter initialEntries={['/admin/reports']}>
    <Routes>
      <Route element={<AdminGate />}>
        <Route path="/admin/reports" element={<AdminPage tab="reports" />} />
      </Route>
    </Routes>
  </MemoryRouter>)
}

beforeEach(async () => {
  await applyLocale('zh-Hant')
  evals.mockReset().mockResolvedValue(EVAL)
  voice.mockReset().mockResolvedValue(VOICE)
  ;(useAuth as jest.Mock).mockReturnValue({ status: 'ready', account: me, refresh: jest.fn() })
})

test('the reports tab shows the case list to type and what the recorded runs scored', async () => {
  renderReports()
  expect(screen.getByRole('tab', { name: '報表' })).toHaveAttribute('aria-selected', 'true')
  const totals = await screen.findByRole('table', { name: '評測總表' })
  expect(within(totals).getByRole('row', { name: /回應方式可接受 50% 2/ })).toBeInTheDocument()
  expect(within(totals).getByRole('row', { name: /拉回／請找老師 — 0/ })).toBeInTheDocument()
  const cases = screen.getByRole('table', { name: '每一題' })
  const first = within(cases).getByRole('row', { name: /normal-numbers/ })
  expect(first).toHaveTextContent('我會拉桿，因為五個人比一個人多。')
  expect(first).toHaveTextContent('75%')
  expect(within(cases).getByRole('row', { name: /lang-en/ })).toHaveTextContent('語言設定是 zh-Hant，這題要先切到 en')
  expect(screen.getByText(SCENARIO)).toBeInTheDocument()
  expect(evals).toHaveBeenCalledWith(7)
})

test('each voice conversation is a row with its tokens and estimated cost', async () => {
  renderReports()
  const list = await screen.findByRole('table', { name: '每一場語音對話' })
  const row = within(list).getByRole('row', { name: /qa-1/ })
  expect(row).toHaveTextContent('1200（1000）')
  expect(row).toHaveTextContent('0.0132')
  expect(screen.queryByText(/還沒設定語音的單價/)).not.toBeInTheDocument()
})

test('without rates the costs stay blank and say why', async () => {
  voice.mockResolvedValue({ ...VOICE, costed: false, sessions: [], totals: { sessions: 0, input_tokens: 0, output_tokens: 0, cost: null } })
  renderReports()
  expect(await screen.findByText(/還沒設定語音的單價/)).toBeInTheDocument()
  expect(screen.getByText('這段時間沒有語音對話。')).toBeInTheDocument()
})

test('choosing a range reads both reports again for it', async () => {
  renderReports()
  await screen.findByRole('table', { name: '評測總表' })
  fireEvent.click(screen.getByRole('button', { name: '最近 30 天' }))
  await waitFor(() => expect(evals).toHaveBeenLastCalledWith(30))
  expect(voice).toHaveBeenLastCalledWith(30)
  expect(screen.getByRole('button', { name: '最近 30 天' })).toHaveAttribute('aria-pressed', 'true')
})

test('a failed read says so', async () => {
  evals.mockRejectedValue(new Error('down'))
  renderReports()
  expect(await screen.findByRole('alert')).toHaveTextContent('讀不到報表，請重新整理頁面。')
})
