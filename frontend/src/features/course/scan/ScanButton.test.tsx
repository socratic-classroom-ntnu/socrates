import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { mockApi, renderAt } from '../../../testing/pageHarness'
import { JoinCodeForm } from '../home/JoinCodeForm'
import { INTRO_SEEN_KEY } from './introSeen'

jest.mock('../../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../../contract/classroomClient')>('../../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

const where = () => screen.getByTestId('where').textContent
const originalPermissions = Object.getOwnPropertyDescriptor(navigator, 'permissions')
const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
const getUserMedia = jest.fn()

function permissions(value: unknown) {
  Object.defineProperty(navigator, 'permissions', { configurable: true, value })
}
function cameraState(state: PermissionState) {
  permissions({ query: jest.fn(async () => ({ state })) })
}

beforeEach(() => {
  getUserMedia.mockReset()
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
})
afterEach(() => {
  if (originalPermissions) Object.defineProperty(navigator, 'permissions', originalPermissions)
  else delete (navigator as { permissions?: unknown }).permissions
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices)
  else delete (navigator as { mediaDevices?: unknown }).mediaDevices
})

async function openHome() {
  mockApi({})
  renderAt('/', '/', <JoinCodeForm variant="phone" />)
  return screen.findByRole('button', { name: '掃描' })
}
async function tapScan() {
  const button = await openHome()
  await act(async () => { fireEvent.click(button) })
}
const intro = () => screen.queryByRole('dialog', { name: '掃描老師的 QR code' })

test('granted goes straight to the scan page', async () => {
  cameraState('granted')
  await tapScan()
  expect(intro()).toBeNull()
  expect(where()).toBe('/scan')
})

test('first tap with prompt shows the explanation and stays home', async () => {
  cameraState('prompt')
  await tapScan()
  const dialog = intro()
  expect(dialog).not.toBeNull()
  expect(within(dialog!).getByText('需要相機權限，才能掃描老師的課程或活動 QR。')).toBeInTheDocument()
  expect(within(dialog!).getByText('按下允許後，瀏覽器才會詢問相機權限。')).toBeInTheDocument()
  expect(where()).toBe('/')
  expect(getUserMedia).not.toHaveBeenCalled()
})

test('prompt after the explanation was shown once skips it', async () => {
  cameraState('prompt')
  localStorage.setItem(INTRO_SEEN_KEY, '1')
  await tapScan()
  expect(intro()).toBeNull()
  expect(where()).toBe('/scan')
})

test('the explanation is shown only once on this browser', async () => {
  cameraState('prompt')
  await tapScan()
  fireEvent.click(within(intro()!).getByRole('button', { name: '取消' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '掃描' })) })
  expect(intro()).toBeNull()
  expect(where()).toBe('/scan')
})

test('without the Permissions API it behaves like prompt', async () => {
  permissions(undefined)
  await tapScan()
  expect(intro()).not.toBeNull()
})

test('a browser that cannot query camera behaves like prompt', async () => {
  permissions({ query: jest.fn(async () => { throw new TypeError('camera is not a valid permission name') }) })
  await tapScan()
  expect(intro()).not.toBeNull()
})

test('when storage is unavailable the explanation shows every time', async () => {
  cameraState('prompt')
  jest.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  jest.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  await tapScan()
  fireEvent.click(within(intro()!).getByRole('button', { name: '取消' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '掃描' })) })
  expect(intro()).not.toBeNull()
})

test.each([
  ['cancel', () => fireEvent.click(within(intro()!).getByRole('button', { name: '取消' }))],
  ['close button', () => fireEvent.click(within(intro()!).getByRole('button', { name: '關閉' }))],
  ['backdrop', () => fireEvent.mouseDown(intro()!.parentElement!)],
  ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
])('%s closes the explanation and stays home without asking for the camera', async (_, dismiss) => {
  cameraState('prompt')
  await tapScan()
  dismiss()
  expect(intro()).toBeNull()
  expect(where()).toBe('/')
  expect(getUserMedia).not.toHaveBeenCalled()
})

test('allow goes to the scan page', async () => {
  cameraState('prompt')
  await tapScan()
  fireEvent.click(within(intro()!).getByRole('button', { name: '允許' }))
  expect(where()).toBe('/scan')
})

test('the scan control is a button, not a link', async () => {
  cameraState('prompt')
  await openHome()
  expect(screen.queryByRole('link', { name: '掃描' })).toBeNull()
})

// S6、S7：首頁上的對話框
const s6 = () => screen.queryByRole('dialog', { name: '需要相機權限' })
const s7 = () => screen.queryByRole('dialog', { name: '相機暫時無法開啟' })

async function arriveWith(scanNotice: 'denied' | 'unavailable') {
  mockApi({})
  renderAt({ pathname: '/', state: { scanNotice } }, '/', <JoinCodeForm variant="phone" />)
  await screen.findByRole('button', { name: '掃描' })
}

test('a camera already refused stays home and shows S6 with the steps to allow it again', async () => {
  cameraState('denied')
  await tapScan()
  const dialog = s6()
  expect(dialog).not.toBeNull()
  expect(dialog).toHaveTextContent('允許此網站使用相機，才能掃描老師提供的 QR。也可以改用輸入代碼。')
  expect(dialog).toHaveTextContent('iPhone（Safari）')
  expect(dialog).toHaveTextContent('網址列的網站選單 → 網站設定 → 相機 → 允許，再重新整理。')
  expect(dialog).toHaveTextContent('Android（Chrome）')
  expect(dialog).toHaveTextContent('網址列的網站資訊 → 權限 → 相機 → 允許，再重新整理。')
  expect(where()).toBe('/')
  expect(getUserMedia).not.toHaveBeenCalled()
})

test('coming back from a refused camera shows S6, and a reload does not show it again', async () => {
  await arriveWith('denied')
  expect(s6()).not.toBeNull()
  expect(screen.getByTestId('where').dataset.state).toBe('')
})

test('coming back from a camera that cannot open shows S7 with the other ways in', async () => {
  await arriveWith('unavailable')
  const dialog = s7()
  expect(dialog).not.toBeNull()
  expect(dialog).toHaveTextContent('可能是裝置或瀏覽器不支援、被其他 App 占用，或等待 10 秒仍沒有畫面。')
  expect(dialog).toHaveTextContent('用手機相機直接掃描')
  expect(dialog).toHaveTextContent('開啟手機內建相機 App，對準老師提供的 QR。')
  expect(dialog).toHaveTextContent('改用手機瀏覽器')
  expect(dialog).toHaveTextContent('若從 LINE、Facebook 等 App 內開啟，改以 Safari 或 Chrome。')
  expect(screen.getByTestId('where').dataset.state).toBe('')
})

test.each([
  ['S6', 'denied' as const, s6],
  ['S7', 'unavailable' as const, s7],
])('%s: every way of closing moves focus to the code field', async (_, notice, dialog) => {
  for (const close of [
    () => fireEvent.click(within(dialog()!).getByRole('button', { name: '改用輸入代碼' })),
    () => fireEvent.click(within(dialog()!).getByRole('button', { name: '關閉' })),
    () => fireEvent.keyDown(document, { key: 'Escape' }),
    () => fireEvent.mouseDown(dialog()!.parentElement!),
  ]) {
    await arriveWith(notice)
    close()
    expect(dialog()).toBeNull()
    expect(screen.getByLabelText('課程代碼')).toHaveFocus()
    expect(where()).toBe('/')
    cleanup()
  }
})

test('S6 retry with the camera still refused shows S6 again', async () => {
  cameraState('denied')
  await arriveWith('denied')
  await act(async () => { fireEvent.click(within(s6()!).getByRole('button', { name: '重試' })) })
  expect(s6()).not.toBeNull()
  expect(where()).toBe('/')
})

test('S6 retry after allowing the camera in settings goes to the scan page', async () => {
  cameraState('granted')
  await arriveWith('denied')
  await act(async () => { fireEvent.click(within(s6()!).getByRole('button', { name: '重試' })) })
  expect(s6()).toBeNull()
  expect(where()).toBe('/scan')
})

test('S7 retry goes back to the scan page', async () => {
  cameraState('prompt')
  localStorage.setItem(INTRO_SEEN_KEY, '1')
  await arriveWith('unavailable')
  await act(async () => { fireEvent.click(within(s7()!).getByRole('button', { name: '重試' })) })
  expect(s7()).toBeNull()
  expect(where()).toBe('/scan')
})
