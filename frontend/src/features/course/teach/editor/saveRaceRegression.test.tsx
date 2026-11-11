import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { Route } from 'react-router-dom'
import { mockApi, renderAt } from '../../../../testing/pageHarness'
import { ActivityEditorPage } from './ActivityEditorPage'
import { loadActivityDraft, memoryKV, setDraftBackend } from './draftStorage'
jest.mock('../../../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../../../contract/classroomClient')>('../../../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})
afterEach(() => setDraftBackend(null))
test('editing while saving preserves the newer unsaved draft', async () => {
  setDraftBackend(memoryKV())
  const end = Math.floor(Date.now() / 1000) + 86400
  const draft = { title: 'Original', starts_at: null, ends_at: end }
  const activity = { id: 'a-1', course_id: 'c-1', status: 'draft', locked: false, draft, starts_at: null, ends_at: end, available_actions: ['update', 'publish', 'copy', 'delete'] }
  const course = { id: 'c-1', name: 'Course', role: 'teacher', available_actions: [] }
  let finish!: (value: unknown) => void
  const calls = mockApi({ 'GET /activities/a-1': activity, 'GET /courses/c-1?role=teacher': course,
    'PUT /activities/a-1': () => new Promise(resolve => { finish = resolve }) })
  renderAt('/teach/activities/a-1/edit', '/__none', null, <Route path="/teach/activities/:activityId/edit" element={<ActivityEditorPage />} />)
  const title = await screen.findByLabelText(/^題目/)
  fireEvent.change(title, { target: { value: 'Saved A' } })
  fireEvent.click(screen.getByRole('button', { name: '儲存變更' }))
  await waitFor(() => expect(calls.some(c => c.key === 'PUT /activities/a-1')).toBe(true))
  expect((calls.find(c => c.key === 'PUT /activities/a-1')?.body as { title: string }).title).toBe('Saved A')
  fireEvent.change(title, { target: { value: 'Unsaved B' } })
  await act(async () => { finish(activity) })
  expect(title).toHaveValue('Unsaved B')
  await waitFor(async () => expect((await loadActivityDraft('u-1:activity:a-1'))?.form.title).toBe('Unsaved B'), { timeout: 1500 })
})
