import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import { ApiError } from '../../api/classroomClient'
import { mockApi, renderAt } from '../../testing/pageHarness'
import { CreateCourseDrawer } from './CreateCourseDrawer'

jest.mock('../../api/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../api/classroomClient')>('../../api/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

const onClose = jest.fn()
const where = () => screen.getByTestId('where').textContent

function open() {
  renderAt('/?tab=teach&create=1', '/', <CreateCourseDrawer onClose={onClose} />)
}

beforeEach(() => onClose.mockReset())

test('defaults teacher name to account and opens the new course', async () => {
  const calls = mockApi({ 'POST /courses': { id: 'c-1' } })
  open()
  expect(await screen.findByLabelText(/教師名稱/)).toHaveValue('Fizzy')
  fireEvent.change(screen.getByLabelText(/課程名稱/), { target: { value: '科技倫理' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '建立課程' })) })
  expect(calls.find(call => call.key === 'POST /courses')?.body).toEqual({ name: '科技倫理', teacher_name: 'Fizzy', intro: '', goals: '' })
  await waitFor(() => expect(where()).toBe('/teach/courses/c-1'))
})

test('shows field errors from 422', async () => {
  mockApi({
    'POST /courses': () => { throw new ApiError(422, [{ loc: ['body', 'name'], type: 'string_too_long', ctx: { max_length: 120 } }]) },
  })
  open()
  fireEvent.change(await screen.findByLabelText(/課程名稱/), { target: { value: '很長的課名' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '建立課程' })) })
  const name = screen.getByLabelText(/課程名稱/)
  expect(name).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByText('最多 120 個字。')).toBeInTheDocument()
  expect(where()).toBe('/?tab=teach&create=1')
})

test('blank required fields are flagged before posting', async () => {
  const calls = mockApi({})
  open()
  fireEvent.change(await screen.findByLabelText(/教師名稱/), { target: { value: '  ' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '建立課程' })) })
  expect(screen.getByLabelText(/課程名稱/)).toHaveAttribute('aria-invalid', 'true')
  expect(screen.getByLabelText(/教師名稱/)).toHaveAttribute('aria-invalid', 'true')
  expect(calls.some(call => call.key === 'POST /courses')).toBe(false)
})

test('Escape and cancel close without posting', async () => {
  const calls = mockApi({})
  open()
  const dialog = await screen.findByRole('dialog', { name: '建立課程' })
  fireEvent.keyDown(dialog, { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  fireEvent.click(screen.getByRole('button', { name: '關閉' }))
  expect(onClose).toHaveBeenCalledTimes(3)
  expect(calls.some(call => call.key === 'POST /courses')).toBe(false)
})

test('focus starts on course name', async () => {
  mockApi({})
  open()
  await waitFor(() => expect(screen.getByLabelText(/課程名稱/)).toHaveFocus())
})

// ---- Review 修正 Task 14 ----

test('backdrop click keeps the drawer open', async () => {
  mockApi({})
  open()
  const dialog = await screen.findByRole('dialog', { name: '建立課程' })
  fireEvent.mouseDown(dialog.parentElement as HTMLElement)
  expect(onClose).not.toHaveBeenCalled()
})

test('cannot close while submitting', async () => {
  let finish: (value: unknown) => void = () => {}
  mockApi({ 'POST /courses': () => new Promise(resolve => { finish = resolve }) })
  open()
  fireEvent.change(await screen.findByLabelText(/課程名稱/), { target: { value: '科技倫理' } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '建立課程' })) })
  const dialog = screen.getByRole('dialog', { name: '建立課程' })
  fireEvent.keyDown(dialog, { key: 'Escape' })
  fireEvent.click(screen.getByRole('button', { name: '取消' }))
  fireEvent.click(screen.getByRole('button', { name: '關閉' }))
  expect(onClose).not.toHaveBeenCalled()
  await act(async () => { finish({ id: 'c-1' }) })
})
