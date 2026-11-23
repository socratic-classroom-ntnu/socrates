
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AccountSettingsPage } from './AccountSettingsPage'
import { useAuth } from '../auth/AuthContext'
import { api } from '../../contract/classroomClient'


jest.mock('../auth/AuthContext', () => ({
  useAuth: jest.fn(),
}))

jest.mock('../../contract/classroomClient', () => ({
  api: jest.fn(),
}))

const originalAccount = {
  id: 'account-1',
  username: 'wangteacher',
  display_name: '王老師',
  email: 'wang@example.edu',
  locale: 'zh-Hant',
  csrf_token: 'test-csrf',
}

const replaceAccount = jest.fn()

function setup() {
  jest.mocked(useAuth).mockReturnValue({
    status: 'ready',
    account: originalAccount,
    replaceAccount,
    refresh: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  } as unknown as ReturnType<typeof useAuth>)

  return render(
    <MemoryRouter>
      <AccountSettingsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  jest.clearAllMocks()
})

test('shows account information', () => {
  setup()

  expect(screen.getByText('wangteacher')).toBeInTheDocument()
  expect(screen.getByText('王老師')).toBeInTheDocument()
  expect(screen.getByText('wang@example.edu')).toBeInTheDocument()
})

test('opens editing mode and cancels without saving', () => {
  setup()

  fireEvent.click(screen.getByRole('button', { name: '編輯個人檔案' }))

  const input = screen.getByRole('textbox', { name: '顯示名稱' })
  fireEvent.change(input, { target: { value: '新名稱' } })

  fireEvent.click(screen.getByRole('button', { name: '取消' }))

  expect(screen.getByText('王老師')).toBeInTheDocument()
  expect(api).not.toHaveBeenCalled()
})

test('saves display name and updates auth state', async () => {
  setup()

  const updated = {
    ...originalAccount,
    display_name: '新名稱',
  }

  jest.mocked(api).mockResolvedValueOnce(updated)

  fireEvent.click(screen.getByRole('button', { name: '編輯個人檔案' }))

  fireEvent.change(screen.getByRole('textbox', { name: '顯示名稱' }), {
    target: { value: ' 新名稱 ' },
  })

  fireEvent.click(screen.getByRole('button', { name: '儲存變更' }))

  await waitFor(() => {
    expect(api).toHaveBeenCalledWith('/account/profile', 'PATCH', {
      display_name: '新名稱',
    })
  })

  await waitFor(() => {
    expect(replaceAccount).toHaveBeenCalledWith(updated)
  })

  expect(await screen.findByText('顯示名稱已成功更新')).toBeInTheDocument()
})

test('rejects an empty display name', () => {
  setup()

  fireEvent.click(screen.getByRole('button', { name: '編輯個人檔案' }))

  fireEvent.change(screen.getByRole('textbox', { name: '顯示名稱' }), {
    target: { value: '   ' },
  })

  fireEvent.click(screen.getByRole('button', { name: '儲存變更' }))

  expect(screen.getByRole('alert')).toHaveTextContent('顯示名稱必須介於 1 至 40 字之間')
  expect(api).not.toHaveBeenCalled()
})

test('keeps input when API fails', async () => {
  setup()

  jest.mocked(api).mockRejectedValueOnce(new Error('Network error'))

  fireEvent.click(screen.getByRole('button', { name: '編輯個人檔案' }))

  fireEvent.change(screen.getByRole('textbox', { name: '顯示名稱' }), {
    target: { value: '保留這個名稱' },
  })

  fireEvent.click(screen.getByRole('button', { name: '儲存變更' }))

  expect(await screen.findByRole('alert')).toHaveTextContent('儲存失敗，請稍後再試')
  expect(screen.getByRole('textbox', { name: '顯示名稱' })).toHaveValue('保留這個名稱')
  expect(replaceAccount).not.toHaveBeenCalled()
})
