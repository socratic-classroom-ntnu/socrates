import { act, fireEvent, screen, within } from '@testing-library/react'
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
