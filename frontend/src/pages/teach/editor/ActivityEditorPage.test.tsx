import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { ApiError } from '../../../api/classroomClient'
import { applyLocale } from '../../../i18n'
import { mockApi, renderAt, signedIn } from '../../../testing/pageHarness'
import { readableText } from '../../auth/testText'
import { ActivityEditorPage } from './ActivityEditorPage'
import { loadActivityDraft, memoryKV, saveActivityDraft, setDraftBackend } from './draftStorage'
import { emptyForm, fromDraft, toEpochSeconds } from './editorState'

jest.mock('../../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../../api/classroomClient')>('../../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

let counter = 0
beforeEach(() => {
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: { randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}` } })
  setDraftBackend(memoryKV())
})
afterAll(() => setDraftBackend(null))

const now = Math.floor(Date.now() / 1000)
const course = {
  role: 'teacher', id: 'c-1', name: '科技倫理', teacher_name: 'Fizzy', intro: '', goals: '', code: 'AB12CD34',
  code_enabled: true, student_count: 0, activity_count: 1, available_actions: [],
}
const draft = {
  title: '第三週倫理討論', topic_direction: '主動與不作為', analysis_focus: '', starts_at: null, ends_at: now + 86400,
  questions: [{ id: 'q1', title: '岔道上的選擇', scenario: '一輛失控的電車', options: [{ id: 'o1', text: '拉' }, { id: 'o2', text: '不拉' }], follow_up_direction: '' }],
}
function view(extra: Record<string, unknown> = {}) {
  return {
    id: 'a-1', course_id: 'c-1', status: 'draft', locked: false, has_unpublished_changes: false, revision: null,
    draft, starts_at: null, ends_at: draft.ends_at, available_actions: ['update', 'publish', 'copy', 'delete'], ...extra,
  }
}
const where = () => screen.getByTestId('where').textContent
const editorRoutes = <>
  <Route path="/teach/courses/:courseId/activities/new" element={<ActivityEditorPage />} />
  <Route path="/teach/activities/:activityId/edit" element={<ActivityEditorPage />} />
</>

function openNew(routes: Record<string, unknown> = {}) {
  const calls = mockApi({ 'GET /courses/c-1?role=teacher': course, ...routes })
  renderAt('/teach/courses/c-1/activities/new', '/__none', null, editorRoutes)
  return calls
}

function openEdit(v: Record<string, unknown>, routes: Record<string, unknown> = {}, state?: unknown) {
  const calls = mockApi({ 'GET /activities/a-1': v, 'GET /courses/c-1?role=teacher': course, ...routes })
  renderAt('/teach/activities/a-1/edit', '/__none', null, editorRoutes)
  void state
  return calls
}

// 下個月 24 日 23:59：用選擇器選，和老師的操作一樣
const later = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 24)
const endPicked = { date: `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, '0')}-24`, time: '23:59' }

function pickEnd() {
  fireEvent.click(screen.getByRole('button', { name: /^結束時間/ }))
  const picker = screen.getByRole('dialog', { name: '選擇日期' })
  fireEvent.click(within(picker).getByRole('button', { name: '下個月' }))
  fireEvent.click(within(picker).getByRole('button', { name: `${later.getFullYear()}年${later.getMonth() + 1}月24日` }))
  fireEvent.click(within(screen.getByRole('listbox', { name: '時' })).getByRole('option', { name: '23' }))
  fireEvent.click(within(screen.getByRole('listbox', { name: '分' })).getByRole('option', { name: '59' }))
  fireEvent.click(screen.getByRole('button', { name: '確認' }))
}

async function fillNew() {
  fireEvent.change(await screen.findByLabelText(/^活動名稱/), { target: { value: '第三週倫理討論' } })
  fireEvent.change(screen.getByLabelText(/^主題方向/), { target: { value: '主動與不作為' } })
  pickEnd()
  fireEvent.change(screen.getByLabelText(/^標題/), { target: { value: '岔道上的選擇' } })
  fireEvent.change(screen.getByLabelText(/^情境敘述/), { target: { value: '一輛失控的電車' } })
  fireEvent.change(screen.getByLabelText('選項 A'), { target: { value: '拉' } })
  fireEvent.change(screen.getByLabelText('選項 B'), { target: { value: '不拉' } })
}

async function click(name: string | RegExp) {
  const button = screen.getByRole('button', { name })
  await act(async () => { fireEvent.click(button) })
}

const created = view({ id: 'a-9' })

test('save to activity list posts the complete draft and stays in the editor', async () => {
  const calls = openNew({ 'POST /courses/c-1/activities': created, 'GET /activities/a-9': created })
  await fillNew()
  await click('儲存至活動列表')
  const body = calls.find(call => call.key === 'POST /courses/c-1/activities')?.body as Record<string, unknown>
  expect(body).toMatchObject({ title: '第三週倫理討論', topic_direction: '主動與不作為', starts_at: null, ends_at: toEpochSeconds(endPicked.date, endPicked.time) })
  expect((body.questions as { options: { text: string }[] }[])[0].options.map(o => o.text)).toEqual(['拉', '不拉'])
  await waitFor(() => expect(where()).toBe('/teach/activities/a-9/edit'))
  expect(await screen.findByText('已儲存至活動列表，學生仍看不到')).toBeInTheDocument()
})

test('create activity posts then publishes then returns to course', async () => {
  const calls = openNew({ 'POST /courses/c-1/activities': created, 'POST /activities/a-9/publish': view({ id: 'a-9', status: 'open' }) })
  await fillNew()
  await click('建立活動')
  expect(calls.map(call => call.key).filter(key => key.startsWith('POST'))).toEqual(['POST /courses/c-1/activities', 'POST /activities/a-9/publish'])
  await waitFor(() => expect(where()).toBe('/teach/courses/c-1'))
})

test('invalid form shows the summary and calls no api', async () => {
  const calls = openNew()
  await screen.findByLabelText(/^活動名稱/)
  await click('建立活動')
  const summary = screen.getByRole('alert')
  expect(within(summary).getByRole('heading')).toHaveTextContent(/^還有 \d+ 個地方要補完，才能儲存$/)
  expect(summary).toHaveTextContent('基礎資訊：活動名稱')
  expect(screen.getByLabelText(/^活動名稱/)).toHaveAttribute('aria-invalid', 'true')
  expect(calls.some(call => call.key.startsWith('POST'))).toBe(false)
})

test('summary item focuses the field and selects its question', async () => {
  openNew()
  await fillNew()
  await click('＋ 新增空白題目')
  expect(screen.getByRole('heading', { name: /題目 2/ })).toBeInTheDocument()
  await click(/^1\s*岔道上的選擇/)
  expect(screen.getByRole('heading', { name: /題目 1/ })).toBeInTheDocument()
  await click('建立活動')
  const items = within(screen.getByRole('alert')).getAllByRole('button')
  expect(items[0]).toHaveTextContent('題目 2：標題')
  await click(/^2\s*（未命名）/)
  await click(/^1\s*岔道上的選擇/)
  await act(async () => { fireEvent.click(within(screen.getByRole('alert')).getAllByRole('button')[0]) })
  expect(screen.getByRole('heading', { name: /題目 2/ })).toBeInTheDocument()
  await waitFor(() => expect(screen.getByLabelText(/^標題/)).toHaveFocus())
  expect(screen.getByRole('button', { name: /^2\s*（未命名）/ })).toHaveTextContent(/[34]$/)
})

test('publish failure after create keeps the draft and flags end time', async () => {
  openNew({
    'POST /courses/c-1/activities': created,
    'POST /activities/a-9/publish': () => { throw new ApiError(422, 'ACTIVITY_TIME_INVALID') },
    'GET /activities/a-9': created,
  })
  await fillNew()
  await click('建立活動')
  await waitFor(() => expect(where()).toBe('/teach/activities/a-9/edit'))
  const summary = await screen.findByRole('alert')
  expect(summary).toHaveTextContent('基礎資訊：結束時間')
})

test('editing a published activity puts then publishes', async () => {
  const published = view({ status: 'open', revision: 1, starts_at: now - 600, available_actions: ['update', 'update_details', 'publish', 'end_now', 'copy', 'delete'] })
  const calls = openEdit(published, { 'PUT /activities/a-1': published, 'POST /activities/a-1/publish': published })
  fireEvent.change(await screen.findByLabelText(/^活動名稱/), { target: { value: '改過的名稱' } })
  expect(screen.queryByRole('button', { name: '建立活動' })).toBeNull()
  await click('儲存變更')
  const put = calls.find(call => call.key === 'PUT /activities/a-1')?.body as Record<string, unknown>
  expect(put.title).toBe('改過的名稱')
  expect(put.starts_at).toBe(now - 600)
  expect(calls.some(call => call.key === 'POST /activities/a-1/publish')).toBe(true)
  await waitFor(() => expect(where()).toBe('/teach/courses/c-1'))
})

test('publish failure keeps pending changes visible', async () => {
  const published = view({ status: 'open', revision: 1, starts_at: now - 600, available_actions: ['update', 'update_details', 'publish', 'end_now', 'copy', 'delete'] })
  openEdit(published, {
    'PUT /activities/a-1': { ...published, has_unpublished_changes: true },
    'POST /activities/a-1/publish': () => { throw new ApiError(422, 'ACTIVITY_TIME_INVALID') },
  })
  fireEvent.change(await screen.findByLabelText(/^活動名稱/), { target: { value: '改過的名稱' } })
  await click('儲存變更')
  expect(await screen.findByText('變更已保留，但尚未發布；學生仍看到上一個版本')).toBeInTheDocument()
  expect(where()).toBe('/teach/activities/a-1/edit')
})

test('pending changes from the server are shown on load', async () => {
  openEdit(view({ status: 'open', revision: 1, has_unpublished_changes: true, starts_at: now - 600, available_actions: ['update', 'update_details', 'publish', 'end_now', 'copy', 'delete'] }))
  expect(await screen.findByText(/有未發布的變更/)).toBeInTheDocument()
})

const lockedView = view({ status: 'open', revision: 1, locked: true, starts_at: now - 600, available_actions: ['update_details', 'end_now', 'copy', 'delete'] })

test('locked activity edits only title and end through patch', async () => {
  const calls = openEdit(lockedView, { 'PATCH /activities/a-1': lockedView })
  expect(await screen.findByText('題目內容已鎖定')).toBeInTheDocument()
  expect(screen.getByLabelText(/^情境敘述/)).toHaveAttribute('readonly')
  expect(screen.getByLabelText(/^主題方向/)).toHaveAttribute('readonly')
  expect(screen.getByRole('tab', { name: 'AI 出題' })).toBeDisabled()
  expect(screen.getByRole('tab', { name: '匯入題目' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: '＋ 新增空白題目' })).toBeNull()
  fireEvent.change(screen.getByLabelText(/^活動名稱/), { target: { value: '新名稱' } })
  await click('儲存變更')
  expect(calls.find(call => call.key === 'PATCH /activities/a-1')?.body).toEqual({ title: '新名稱' })
  await waitFor(() => expect(where()).toBe('/teach/courses/c-1'))
})

test('locked activity with pending changes explains copy path', async () => {
  openEdit({ ...lockedView, has_unpublished_changes: true })
  expect(await screen.findByText('活動在變更發布前已被鎖定，學生仍看到上一個版本。複製成新活動可以保留這些變更。')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '複製成新活動' })).toBeInTheDocument()
})

test('copy from locked banner opens the new draft with a copied note', async () => {
  openEdit(lockedView, {
    'POST /activities/a-1/copy': view({ id: 'a-2' }),
    'GET /activities/a-2': view({ id: 'a-2' }),
  })
  await screen.findByText('題目內容已鎖定')
  await click('複製成新活動')
  await waitFor(() => expect(where()).toBe('/teach/activities/a-2/edit'))
  expect(await screen.findByText('這是「第三週倫理討論」的複本，修改後再建立活動。')).toBeInTheDocument()
})

test('delete from the editor confirms then returns to the course', async () => {
  const calls = openEdit(view(), { 'DELETE /activities/a-1': null })
  await screen.findByLabelText(/^活動名稱/)
  await click('刪除活動')
  await click('確認刪除')
  expect(calls.some(call => call.key === 'DELETE /activities/a-1')).toBe(true)
  await waitFor(() => expect(where()).toBe('/teach/courses/c-1'))
})

test('ended activity is read-only', async () => {
  openEdit(view({ status: 'ended', revision: 1, starts_at: now - 7200, ends_at: now - 60, available_actions: ['copy', 'delete'] }))
  expect(await screen.findByLabelText(/^活動名稱/)).toHaveAttribute('readonly')
  expect(screen.queryByRole('button', { name: '儲存變更' })).toBeNull()
  expect(screen.queryByRole('button', { name: '建立活動' })).toBeNull()
  expect(screen.getByRole('button', { name: '複製成新活動' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '刪除活動' })).toBeInTheDocument()
})

test('offers to restore an unfinished form without overwriting the server copy', async () => {
  await saveActivityDraft('u-1:activity:a-1', { ...emptyForm(), title: '本機寫到一半' }, new Date().toISOString())
  openEdit(view())
  expect(await screen.findByRole('dialog', { name: /找到/ })).toBeInTheDocument()
  expect(screen.getByLabelText(/^活動名稱/)).toHaveValue('第三週倫理討論')
  await click('恢復')
  expect(screen.getByLabelText(/^活動名稱/)).toHaveValue('本機寫到一半')
})

test('autosave status is shown', async () => {
  openNew()
  expect(await screen.findByText('內容會自動暫存在這台裝置')).toBeInTheDocument()
})

test('es locale renders without Chinese', async () => {
  await applyLocale('es')
  mockApi({ 'GET /auth/me': { ...signedIn, locale: 'es' }, 'GET /courses/c-1?role=teacher': { ...course, name: 'Ethics' } })
  renderAt('/teach/courses/c-1/activities/new', '/__none', null, editorRoutes)
  expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
  expect(readableText(document.body)).not.toMatch(/[㐀-鿿]/)
})

test("copy opens the copy's own content", async () => {
  const copyDraft = {
    ...draft, title: '複本的名稱',
    questions: [{ id: 'q9', title: '複本的題目', scenario: '複本的情境', options: [{ id: 'o9a', text: '甲' }, { id: 'o9b', text: '乙' }], follow_up_direction: '' }],
  }
  const copyView = view({ id: 'a-2', draft: copyDraft })
  const calls = openEdit(lockedView, {
    'POST /activities/a-1/copy': copyView,
    'GET /activities/a-2': copyView,
    'PUT /activities/a-2': copyView,
  })
  await screen.findByText('題目內容已鎖定')
  await click('複製成新活動')
  await waitFor(() => expect(where()).toBe('/teach/activities/a-2/edit'))
  expect(await screen.findByDisplayValue('複本的名稱')).toBeInTheDocument()
  await click('儲存變更')
  const put = calls.find(call => call.key === 'PUT /activities/a-2')?.body as { questions: { id: string; options: { id: string }[] }[] }
  expect(put.questions[0].id).toBe('q9')
  expect(put.questions[0].options.map(o => o.id)).toEqual(['o9a', 'o9b'])
})

// ---- Review 修正 Task 13 ----

test('closing the restore dialog keeps the snapshot', async () => {
  await saveActivityDraft('u-1:activity:a-1', { ...fromDraft(draft), title: '本機寫到一半' }, new Date().toISOString())
  const first = openEdit(view())
  void first
  const dialog = await screen.findByRole('dialog', { name: /找到/ })
  fireEvent.keyDown(dialog, { key: 'Escape' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(screen.getByLabelText(/^活動名稱/)).toHaveValue('第三週倫理討論')
  expect((await loadActivityDraft('u-1:activity:a-1'))?.form.title).toBe('本機寫到一半')
})

test('restore is focused first', async () => {
  await saveActivityDraft('u-1:activity:a-1', { ...fromDraft(draft), title: '本機寫到一半' }, new Date().toISOString())
  openEdit(view())
  await screen.findByRole('dialog', { name: /找到/ })
  await waitFor(() => expect(screen.getByRole('button', { name: '恢復' })).toHaveFocus())
})

test('identical snapshot is cleared silently', async () => {
  await saveActivityDraft('u-1:activity:a-1', fromDraft(draft), new Date().toISOString())
  openEdit(view())
  await screen.findByLabelText(/^活動名稱/)
  await waitFor(async () => expect(await loadActivityDraft('u-1:activity:a-1')).toBeNull())
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('put rejected as locked reloads into the locked mode', async () => {
  let gets = 0
  const published = view({ status: 'open', revision: 1, starts_at: now - 600, available_actions: ['update', 'update_details', 'publish', 'end_now', 'copy', 'delete'] })
  openEdit(published, {
    'GET /activities/a-1': () => (++gets === 1 ? published : lockedView),
    'PUT /activities/a-1': () => { throw new ApiError(409, 'ACTIVITY_LOCKED') },
  })
  fireEvent.change(await screen.findByLabelText(/^活動名稱/), { target: { value: '我改的名稱' } })
  await click('儲存變更')
  expect(await screen.findByText('題目內容已鎖定')).toBeInTheDocument()
  expect(screen.getByText('活動狀態已經改變，已重新整理')).toBeInTheDocument()
  expect(screen.getByLabelText(/^活動名稱/)).toHaveValue('我改的名稱')
  expect(screen.getByLabelText(/^情境敘述/)).toHaveAttribute('readonly')
})

test('deleted elsewhere shows not found', async () => {
  openEdit(view(), { 'PUT /activities/a-1': () => { throw new ApiError(404, 'ACTIVITY_NOT_FOUND') } })
  await screen.findByLabelText(/^活動名稱/)
  await click('儲存變更')
  expect(await screen.findByText('找不到這個活動')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '回到課程頁' })).toHaveAttribute('href', '/teach/courses/c-1')
})

test('publish failure after create with another error explains it', async () => {
  openNew({
    'POST /courses/c-1/activities': created,
    'POST /activities/a-9/publish': () => { throw new ApiError(500, 'BOOM') },
    'GET /activities/a-9': created,
  })
  await fillNew()
  await click('建立活動')
  await waitFor(() => expect(where()).toBe('/teach/activities/a-9/edit'))
  expect(await screen.findByRole('alert')).toHaveTextContent('伺服器暫時無法處理，請稍後再試。')
})

test('server 422 opens the collapsed section', async () => {
  openEdit(view(), { 'PUT /activities/a-1': () => { throw new ApiError(422, [{ loc: ['body', 'ends_at'], type: 'missing' }]) } })
  await screen.findByLabelText(/^活動名稱/)
  await click('收合「基礎資訊」')
  expect(screen.queryByRole('button', { name: /^結束時間/ })).toBeNull()
  await click('儲存變更')
  expect(await screen.findByRole('button', { name: /^結束時間/ })).toHaveAttribute('aria-invalid', 'true')
  fireEvent.change(screen.getByLabelText(/^活動名稱/), { target: { value: '改一下' } })
  expect(screen.getByRole('button', { name: /^結束時間/ })).toHaveAttribute('aria-invalid', 'true')
})

test('read-only activity does not offer to extend the end', async () => {
  openEdit(view({ status: 'ended', revision: 1, starts_at: now - 7200, ends_at: now - 60, available_actions: ['copy', 'delete'] }))
  await screen.findByLabelText(/^活動名稱/)
  expect(screen.queryByText(/可以延後結束時間/)).toBeNull()
})

test('assist placeholder has no link out of the editor', async () => {
  openNew()
  await screen.findByLabelText(/^活動名稱/)
  fireEvent.click(screen.getByRole('tab', { name: 'AI 出題' }))
  const panel = screen.getByText('AI 出題之後會放在這裡。').closest('section') as HTMLElement
  expect(within(panel).queryAllByRole('link')).toHaveLength(0)
  fireEvent.click(screen.getByRole('tab', { name: '匯入題目' }))
  const other = screen.getByText('匯入題目之後會放在這裡。').closest('section') as HTMLElement
  expect(within(other).queryAllByRole('link')).toHaveLength(0)
})

test('cancel and delete are disabled while saving', async () => {
  let finish: (value: unknown) => void = () => {}
  openEdit(view(), { 'PUT /activities/a-1': () => new Promise(resolve => { finish = resolve }) })
  await screen.findByLabelText(/^活動名稱/)
  await click('儲存變更')
  expect(screen.getByRole('button', { name: '取消' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '刪除活動' })).toBeDisabled()
  await act(async () => { finish(view()) })
  expect(screen.getByRole('button', { name: '取消' })).not.toBeDisabled()
})

test('locked save without changes returns to the course', async () => {
  const calls = openEdit(lockedView)
  await screen.findByText('題目內容已鎖定')
  await click('儲存變更')
  expect(calls.some(call => call.key === 'PATCH /activities/a-1')).toBe(false)
  await waitFor(() => expect(where()).toBe('/teach/courses/c-1'))
})

// ---- 審核修正 ----
test('leaving through the breadcrumb right after typing still keeps the change', async () => {
  openEdit(view())
  fireEvent.change(await screen.findByLabelText(/^活動名稱/), { target: { value: '剛打的字' } })
  // 300ms 內就離開：SPA 導航不會觸發 beforeunload／visibilitychange
  fireEvent.click(screen.getByRole('link', { name: '科技倫理' }))
  await waitFor(() => expect(where()).toBe('/teach/courses/c-1'))
  await waitFor(async () => expect((await loadActivityDraft('u-1:activity:a-1'))?.form.title).toBe('剛打的字'))
})

test('a locked scheduled activity still keeps the end after its start', async () => {
  const at = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 15, 10, 0)
  const start = at.getTime() / 1000
  openEdit(view({
    status: 'scheduled', locked: true, revision: 1, starts_at: start, ends_at: start + 86400,
    draft: { ...draft, starts_at: start, ends_at: start + 86400 },
    available_actions: ['update_details', 'start_now', 'end_now', 'copy', 'delete'],
  }))
  // 選擇器會直接翻到目前結束時間（開始的隔天）所在的月份
  fireEvent.click(await screen.findByRole('button', { name: /^結束時間/ }))
  const month = `${at.getFullYear()}年${at.getMonth() + 1}月`
  expect(screen.getByRole('button', { name: `${month}14日` })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: `${month}15日` }))
  expect(within(screen.getByRole('listbox', { name: '時' })).getAllByRole('option')[0]).toHaveTextContent('10')
})
