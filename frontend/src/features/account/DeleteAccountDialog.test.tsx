import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { DeleteAccountDialog } from './DeleteAccountDialog'
import { ApiError, checkAccountDeletion, deleteAccount } from '../../contract/classroomClient'
import { useAuth } from '../auth/AuthContext'
import { applyLocale } from '../../i18n'

jest.mock('../auth/AuthContext', () => ({ useAuth: jest.fn() }))
jest.mock('../../contract/classroomClient', () => ({
  ...jest.requireActual('../../contract/classroomClient'),
  checkAccountDeletion: jest.fn(),
  deleteAccount: jest.fn(),
}))

const clearSession = jest.fn()
const onClose = jest.fn()

function setup() {
  return render(
    <MemoryRouter initialEntries={['/account']}>
      <Routes>
        <Route path="/account" element={<DeleteAccountDialog username="Teacher" onClose={onClose} />} />
        <Route path="/login" element={<p>Login destination</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function confirm() {
  fireEvent.click(await screen.findByRole('button', { name: '繼續' }))
  const input = screen.getByRole('textbox', { name: '帳號名稱' })
  expect(input).toHaveFocus()
  return input
}

beforeEach(async () => {
  jest.resetAllMocks()
  await applyLocale('zh-Hant')
  jest.mocked(useAuth).mockReturnValue({ clearSession } as unknown as ReturnType<typeof useAuth>)
  jest.mocked(checkAccountDeletion).mockResolvedValue({ can_delete: true, courses: [] })
})

test('requires two confirmations and a matching username before deleting and clearing the session', async () => {
  jest.mocked(deleteAccount).mockResolvedValue({ status: 'ACCOUNT_DELETED' })
  setup()
  const input = await confirm()
  const submit = screen.getByRole('button', { name: '永久刪除帳號' })
  expect(submit).toBeDisabled()
  fireEvent.change(input, { target: { value: 'someone else' } })
  fireEvent.submit(input.closest('form')!)
  expect(deleteAccount).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: ' teacher ' } })
  fireEvent.click(submit)
  expect(await screen.findByText('Login destination')).toBeInTheDocument()
  expect(deleteAccount).toHaveBeenCalledWith('teacher')
  expect(clearSession).toHaveBeenCalledTimes(1)
})

test('blocks deletion and lists owned courses', async () => {
  jest.mocked(checkAccountDeletion).mockResolvedValue({ can_delete: false, courses: ['Ethics'] })
  setup()
  expect(await screen.findByText('Ethics')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '繼續' })).not.toBeInTheDocument()
  expect(deleteAccount).not.toHaveBeenCalled()
})

test('allows retry after an eligibility failure', async () => {
  jest.mocked(checkAccountDeletion).mockRejectedValueOnce(new Error('offline'))
  setup()
  expect(await screen.findByRole('alert')).toHaveTextContent('無法檢查刪除資格')
  fireEvent.click(screen.getByRole('button', { name: '重新檢查' }))
  expect(await screen.findByRole('button', { name: '繼續' })).toBeInTheDocument()
  expect(checkAccountDeletion).toHaveBeenCalledTimes(2)
})

test('cancels the eligibility request on unmount', () => {
  jest.mocked(checkAccountDeletion).mockReturnValue(new Promise(() => {}))
  const view = setup()
  const signal = jest.mocked(checkAccountDeletion).mock.calls[0][0]!
  expect(signal.aborted).toBe(false)
  view.unmount()
  expect(signal.aborted).toBe(true)
})

test('prevents duplicate submission and closing while deletion is pending', async () => {
  let rejectRequest!: (reason: Error) => void
  jest.mocked(deleteAccount).mockReturnValue(new Promise((_, reject) => { rejectRequest = reject }))
  setup()
  const input = await confirm()
  fireEvent.change(input, { target: { value: 'Teacher' } })
  fireEvent.submit(input.closest('form')!)
  fireEvent.submit(input.closest('form')!)
  fireEvent.click(screen.getByRole('button', { name: '關閉' }))
  expect(onClose).not.toHaveBeenCalled()
  expect(deleteAccount).toHaveBeenCalledTimes(1)
  await act(async () => { rejectRequest(new Error('offline')) })
  expect(screen.getByRole('alert')).toHaveTextContent('刪除失敗')
  expect(input).toHaveValue('Teacher')
  expect(clearSession).not.toHaveBeenCalled()
})

test('refreshes blocking courses if ownership changes before deletion', async () => {
  jest.mocked(deleteAccount).mockRejectedValue(new ApiError(409, 'ACCOUNT_HAS_COURSES'))
  setup()
  const input = await confirm()
  jest.mocked(checkAccountDeletion).mockResolvedValue({ can_delete: false, courses: ['New course'] })
  fireEvent.change(input, { target: { value: 'Teacher' } })
  fireEvent.submit(input.closest('form')!)
  expect(await screen.findByText('New course')).toBeInTheDocument()
  expect(clearSession).not.toHaveBeenCalled()
})

test('translates an existing error when the locale changes', async () => {
  jest.mocked(deleteAccount).mockRejectedValue(new ApiError(400, 'ACCOUNT_USERNAME_MISMATCH'))
  setup()
  const input = await confirm()
  fireEvent.change(input, { target: { value: 'Teacher' } })
  fireEvent.submit(input.closest('form')!)
  expect(await screen.findByRole('alert')).toHaveTextContent('輸入的帳號名稱不正確')
  await act(async () => { await applyLocale('en') })
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('The username does not match.'))
})
