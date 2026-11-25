import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { deleteAvatar, uploadAvatar } from '../../contract/accountClient'
import { applyLocale } from '../../i18n'
import { AvatarEditor, AvatarFlow } from './AvatarEditor'
import { cropToJpeg, loadImage } from './avatarImage'

jest.mock('../../contract/accountClient', () => ({
  ...jest.requireActual('../../contract/accountClient'),
  uploadAvatar: jest.fn(),
  deleteAvatar: jest.fn(),
}))
jest.mock('./avatarImage', () => ({ loadImage: jest.fn(), cropToJpeg: jest.fn() }))

const MB = 1024 * 1024
const UPDATED = { id: 'a-1', username: 'wangteacher', avatar_updated_at: 2 }

function file(name: string, type: string, size: number): File {
  const picked = new File(['x'], name, { type })
  Object.defineProperty(picked, 'size', { value: size })
  return picked
}

function pick(picked: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!
  fireEvent.change(input, { target: { files: [picked] } })
}

function phone(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => ({
    matches, media: query, onchange: null, addListener() {}, removeListener() {},
    addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true },
  }) })
}

function openFlow(onUpdated = jest.fn(), onClose = jest.fn()) {
  render(<AvatarFlow variant="dialog" name="王老師" onUpdated={onUpdated} onClose={onClose} />)
  return { onUpdated, onClose }
}

beforeEach(async () => {
  jest.clearAllMocks()
  phone(false)
  await applyLocale('zh-Hant')
  jest.mocked(loadImage).mockResolvedValue({ naturalWidth: 400, naturalHeight: 300 } as HTMLImageElement)
  jest.mocked(cropToJpeg).mockResolvedValue(new Blob(['jpeg'], { type: 'image/jpeg' }))
  URL.createObjectURL = jest.fn(() => 'blob:preview')
  URL.revokeObjectURL = jest.fn()
})

test('the first step says JPG or PNG up to 10 MB', () => {
  openFlow()
  expect(screen.getByRole('dialog', { name: '更換個人圖片' })).toBeInTheDocument()
  expect(screen.getByText(/單一檔案不得超過 10 MB/)).toBeInTheDocument()
  expect(document.body.textContent).not.toMatch(/5 (MB|GB)/)
})

test('a picture of exactly 10 MB goes on to cropping', async () => {
  openFlow()
  pick(file('profile.jpg', 'image/jpeg', 10 * MB))
  expect(await screen.findByRole('dialog', { name: '裁切與調整圖片' })).toBeInTheDocument()
})

test('a picture over 10 MB is rejected and another can be picked', async () => {
  openFlow()
  pick(file('profile-large.jpg', 'image/jpeg', 10 * MB + 1))

  expect(await screen.findByRole('dialog', { name: '無法上傳圖片' })).toBeInTheDocument()
  expect(screen.getByText('檔案超過 10 MB')).toBeInTheDocument()
  expect(screen.getByText('profile-large.jpg')).toBeInTheDocument()
  expect(loadImage).not.toHaveBeenCalled()

  pick(file('profile.jpg', 'image/jpeg', MB))
  expect(await screen.findByRole('dialog', { name: '裁切與調整圖片' })).toBeInTheDocument()
})

test('a GIF is rejected as an unsupported format', async () => {
  openFlow()
  pick(file('profile.gif', 'image/gif', 320 * 1024))
  expect(await screen.findByText('不支援此檔案格式')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '重新選擇圖片' })).toBeInTheDocument()
})

test('cropping, confirming and saving uploads the cropped JPEG', async () => {
  const { onUpdated, onClose } = openFlow()
  jest.mocked(uploadAvatar).mockResolvedValue(UPDATED as never)
  pick(file('profile.jpg', 'image/jpeg', MB))

  fireEvent.click(await screen.findByRole('button', { name: '確認裁切' }))
  const confirm = await screen.findByRole('dialog', { name: '確認你的新頭像' })
  expect(within(confirm).getByText('王老師')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '確認並儲存' }))

  await waitFor(() => expect(onUpdated).toHaveBeenCalledWith(UPDATED))
  const sent = jest.mocked(uploadAvatar).mock.calls[0][0]
  expect(sent.type).toBe('image/jpeg')
  expect(onClose).toHaveBeenCalled()
})

test('zoom has a slider, minus, plus and reset', async () => {
  openFlow()
  pick(file('profile.jpg', 'image/jpeg', MB))
  const slider = await screen.findByRole('slider', { name: /縮放/ })
  fireEvent.click(screen.getByRole('button', { name: '放大' }))
  expect(Number((slider as HTMLInputElement).value)).toBeGreaterThan(1)
  fireEvent.click(screen.getByRole('button', { name: '重設' }))
  expect(Number((slider as HTMLInputElement).value)).toBe(1)
})

test('in English the whole flow has no Chinese', async () => {
  await act(async () => { await applyLocale('en') })
  openFlow()
  expect(document.body.textContent).not.toMatch(/[一-鿿]/)
  pick(file('profile.gif', 'image/gif', 1024))
  await screen.findByRole('button', { name: /choose another/i })
  expect(document.body.textContent).not.toMatch(/[一-鿿]/)
})

test('as a phone page it has a title, steps and a back button', () => {
  const onClose = jest.fn()
  render(<AvatarFlow variant="page" name="王老師" onUpdated={jest.fn()} onClose={onClose} />)
  expect(screen.getByRole('heading', { level: 1, name: '更換個人圖片' })).toBeInTheDocument()
  expect(screen.getByText('1 選擇圖片')).toBeInTheDocument()
  expect(screen.getByText('3 確認頭像')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '返回' }))
  expect(onClose).toHaveBeenCalled()
})

describe('the avatar on the settings page', () => {
  function settings(avatarUrl?: string, onUpdated = jest.fn()) {
    render(<MemoryRouter initialEntries={['/account']}>
      <Routes>
        <Route path="/account" element={<AvatarEditor name="王老師" avatarUrl={avatarUrl} onUpdated={onUpdated} />} />
        <Route path="/account/avatar" element={<p>avatar page</p>} />
      </Routes>
    </MemoryRouter>)
    return onUpdated
  }

  test('shows the first letter when the picture cannot be read', () => {
    settings('/api/v2/account/avatar?v=1')
    const image = document.querySelector('img')!
    fireEvent.error(image)
    expect(screen.getByRole('button', { name: 'Edit' })).toHaveTextContent('王')
  })

  test('without a picture the menu only offers to change it', () => {
    settings()
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByRole('menuitem', { name: '更換圖片' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: '刪除圖片' })).toBeNull()
  })

  test('the computer menu works from the keyboard: focus on the first item, Escape closes', async () => {
    settings('/api/v2/account/avatar?v=1')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await waitFor(() => expect(screen.getByRole('menuitem', { name: '更換圖片' })).toHaveFocus())
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' })
    expect(screen.getByRole('menuitem', { name: '刪除圖片' })).toHaveFocus()
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  test('while the picture is being deleted it cannot be changed at the same time', async () => {
    jest.mocked(deleteAvatar).mockReturnValue(new Promise(() => {}))
    settings('/api/v2/account/avatar?v=1')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '刪除圖片' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled())
  })

  test('on a phone, changing and cancelling wait for a pending delete', async () => {
    phone(true)
    jest.mocked(deleteAvatar).mockReturnValue(new Promise(() => {}))
    settings('/api/v2/account/avatar?v=1')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const sheet = screen.getByRole('dialog', { name: '個人圖片' })
    fireEvent.click(within(sheet).getByRole('button', { name: '刪除圖片' }))
    await waitFor(() => expect(within(sheet).getByRole('button', { name: '更換圖片' })).toBeDisabled())
    expect(within(sheet).getByRole('button', { name: '取消' })).toBeDisabled()
  })

  test('deleting the picture goes back to the letter', async () => {
    jest.mocked(deleteAvatar).mockResolvedValue({ ...UPDATED, avatar_updated_at: null } as never)
    const onUpdated = settings('/api/v2/account/avatar?v=1')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '刪除圖片' }))
    await waitFor(() => expect(onUpdated).toHaveBeenCalledWith({ ...UPDATED, avatar_updated_at: null }))
  })

  test('on a phone Edit opens a sheet from the bottom, and 更換圖片 opens the avatar page', () => {
    phone(true)
    settings('/api/v2/account/avatar?v=1')
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    const sheet = screen.getByRole('dialog', { name: '個人圖片' })
    expect(within(sheet).getByRole('button', { name: '刪除圖片' })).toBeInTheDocument()
    expect(within(sheet).getByRole('button', { name: '取消' })).toBeInTheDocument()
    fireEvent.click(within(sheet).getByRole('button', { name: '更換圖片' }))
    expect(screen.getByText('avatar page')).toBeInTheDocument()
  })
})
