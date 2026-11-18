import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { ROUTER_FUTURE } from '../../../app/routerFuture'
import { ApiError } from '../../../contract/classroomClient'
import { Where, mockApi } from '../../../testing/pageHarness'
import { loadQrDetector } from './qrDetector'
import { PICTURE_TIMEOUT_MS } from './useCamera'
import { FOUND_DELAY_MS } from './scanTiming'
import { SCAN_INTERVAL_MS } from './useQrScanner'
import { ScanPage } from './ScanPage'

jest.mock('./qrDetector', () => ({ loadQrDetector: jest.fn() }))
// 這裡自己 mock react-router-dom，蓋掉 setupTests 的預設，所以 MemoryRouter 要自己帶 future。
// 記下每一次換頁的呼叫：同一個 tick 裡換兩次頁，React 只會 render 最後一次，從畫面上的網址數不出來
const mockNavigations: unknown[][] = []
jest.mock('react-router-dom', () => {
  const actual = jest.requireActual<typeof import('react-router-dom')>('react-router-dom')
  const { useCallback } = jest.requireActual<typeof import('react')>('react')
  return {
    ...actual,
    useNavigate() {
      const navigate = actual.useNavigate()
      return useCallback((...args: Parameters<typeof navigate>) => {
        mockNavigations.push(args)
        return navigate(...(args as [never]))
      }, [navigate])
    },
  }
})
jest.mock('../../../contract/classroomClient', () => {
  const actual = jest.requireActual<typeof import('../../../contract/classroomClient')>('../../../contract/classroomClient')
  return { ApiError: actual.ApiError, api: jest.fn(), command: jest.fn(), setCSRF: jest.fn() }
})

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
const getUserMedia = jest.fn()
const detect = jest.fn()

function fakeStream() {
  const track = { stop: jest.fn() }
  return { stream: { getTracks: () => [track] } as unknown as MediaStream, track }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

beforeEach(() => {
  getUserMedia.mockReset()
  detect.mockReset().mockResolvedValue(null)
  jest.mocked(loadQrDetector).mockReset().mockResolvedValue({ detect })
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  jest.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
})
afterEach(() => {
  jest.useRealTimers()
  if (originalMediaDevices) Object.defineProperty(navigator, 'mediaDevices', originalMediaDevices)
  else delete (navigator as { mediaDevices?: unknown }).mediaDevices
})

function Home() {
  const navigate = useNavigate()
  return <><p>home</p><button type="button" onClick={() => navigate(-1)}>browser back</button></>
}

function open() {
  mockNavigations.length = 0
  return render(<MemoryRouter future={ROUTER_FUTURE} initialEntries={['/elsewhere', '/scan']} initialIndex={1}>
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/" element={<Home />} />
      <Route path="*" element={<p>other-page</p>} />
    </Routes>
    <Where />
  </MemoryRouter>)
}

const where = () => screen.getByTestId('where')
const video = () => document.querySelector('video')!
const flush = () => act(async () => { await Promise.resolve() })

test('opens on S2 and asks for the back camera', async () => {
  getUserMedia.mockReturnValue(new Promise(() => {}))
  open()
  await flush()
  expect(screen.getByText('正在開啟相機…')).toBeInTheDocument()
  expect(screen.getByText('相機畫面出現後，即可對準 QR。')).toBeInTheDocument()
  expect(screen.getByText('將 QR 放入框內，即可自動掃描')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /改用輸入代碼/ })).toBeInTheDocument()
  expect(getUserMedia).toHaveBeenCalledTimes(1)
  const constraints = getUserMedia.mock.calls[0][0] as MediaStreamConstraints
  expect(constraints.audio).toBeFalsy()
  expect(JSON.stringify(constraints.video)).toContain('environment')
})

test('the video plays inline, muted and automatically so iPhone keeps it in the page', async () => {
  getUserMedia.mockReturnValue(new Promise(() => {}))
  open()
  await flush()
  expect(video()).toHaveAttribute('playsinline')
  expect(video()).toHaveAttribute('autoplay')
  expect(video().muted).toBe(true)
})

test('S2 stays until the camera picture plays', async () => {
  const { stream } = fakeStream()
  getUserMedia.mockResolvedValue(stream)
  open()
  await flush()
  expect(video().srcObject).toBe(stream)
  expect(screen.getByText('正在開啟相機…')).toBeInTheDocument()
  fireEvent(video(), new Event('playing'))
  expect(screen.queryByText('正在開啟相機…')).toBeNull()
  expect(where()).toHaveTextContent('/scan')
})

test('a refused camera goes home with S6 and leaves no scan page in history', async () => {
  getUserMedia.mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
  open()
  await flush()
  expect(where()).toHaveTextContent(/^\/$/)
  expect(JSON.parse(where().dataset.state!)).toEqual({ scanNotice: 'denied' })
  fireEvent.click(screen.getByRole('button', { name: 'browser back' }))
  expect(where()).toHaveTextContent('/elsewhere')
})

test.each([
  ['in use by another app', () => getUserMedia.mockRejectedValue(new DOMException('Could not start video source', 'NotReadableError'))],
  ['no camera', () => getUserMedia.mockRejectedValue(new DOMException('Requested device not found', 'NotFoundError'))],
  ['an unknown failure', () => getUserMedia.mockRejectedValue(new Error('boom'))],
  ['no camera API', () => Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })],
])('a camera that cannot open (%s) goes home with S7', async (_, setup) => {
  setup()
  open()
  await flush()
  expect(where()).toHaveTextContent(/^\/$/)
  expect(JSON.parse(where().dataset.state!)).toEqual({ scanNotice: 'unavailable' })
  fireEvent.click(screen.getByRole('button', { name: 'browser back' }))
  expect(where()).toHaveTextContent('/elsewhere')
})

test('no picture within 10 seconds of getting the camera goes home with S7 and stops the camera', async () => {
  jest.useFakeTimers()
  const { stream, track } = fakeStream()
  getUserMedia.mockResolvedValue(stream)
  open()
  await flush()
  act(() => { jest.advanceTimersByTime(PICTURE_TIMEOUT_MS - 1) })
  expect(where()).toHaveTextContent('/scan')
  act(() => { jest.advanceTimersByTime(1) })
  expect(JSON.parse(where().dataset.state!)).toEqual({ scanNotice: 'unavailable' })
  expect(track.stop).toHaveBeenCalled()
})

test('time spent on the browser permission prompt does not count toward the 10 seconds', async () => {
  jest.useFakeTimers()
  const pending = deferred<MediaStream>()
  getUserMedia.mockReturnValue(pending.promise)
  open()
  act(() => { jest.advanceTimersByTime(PICTURE_TIMEOUT_MS * 2) })
  await flush()
  expect(where()).toHaveTextContent('/scan')
  pending.resolve(fakeStream().stream)
  await flush()
  act(() => { jest.advanceTimersByTime(PICTURE_TIMEOUT_MS - 1) })
  expect(where()).toHaveTextContent('/scan')
})

test('a picture in time cancels the 10-second limit', async () => {
  jest.useFakeTimers()
  getUserMedia.mockResolvedValue(fakeStream().stream)
  open()
  await flush()
  fireEvent(video(), new Event('playing'))
  act(() => { jest.advanceTimersByTime(PICTURE_TIMEOUT_MS * 2) })
  expect(where()).toHaveTextContent('/scan')
})

test('close goes home without a notice, replaces history and stops the camera', async () => {
  const { stream, track } = fakeStream()
  getUserMedia.mockResolvedValue(stream)
  open()
  await flush()
  fireEvent.click(screen.getByRole('button', { name: '關閉' }))
  expect(where()).toHaveTextContent(/^\/$/)
  expect(where().dataset.state).toBe('')
  expect(track.stop).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'browser back' }))
  expect(where()).toHaveTextContent('/elsewhere')
})

test('leaving the page stops every camera track', async () => {
  const one = fakeStream()
  const two = { stop: jest.fn() }
  getUserMedia.mockResolvedValue({ getTracks: () => [one.track, two] })
  const view = open()
  await flush()
  view.unmount()
  expect(one.track.stop).toHaveBeenCalled()
  expect(two.stop).toHaveBeenCalled()
})

test('a camera that arrives after the page is gone is stopped at once', async () => {
  const pending = deferred<MediaStream>()
  getUserMedia.mockReturnValue(pending.promise)
  const view = open()
  await flush()
  view.unmount()
  const { stream, track } = fakeStream()
  pending.resolve(stream)
  await flush()
  expect(track.stop).toHaveBeenCalled()
})

// S3：有畫面之後
async function playing() {
  const camera = fakeStream()
  getUserMedia.mockResolvedValue(camera.stream)
  open()
  await flush()
  Object.defineProperty(video(), 'videoWidth', { configurable: true, value: 1280 })
  Object.defineProperty(video(), 'videoHeight', { configurable: true, value: 720 })
  fireEvent(video(), new Event('playing'))
  return camera
}

test('with a picture, S3 asks to aim at the QR inside the frame', async () => {
  await playing()
  expect(screen.getByRole('heading', { name: '對準老師投影的 QR' })).toBeInTheDocument()
  expect(screen.getByTestId('scan-frame')).toHaveAttribute('data-state', 'aiming')
  expect(screen.getByText('將 QR 放入框內，即可自動掃描')).toBeInTheDocument()
})

test('S2 has no frame and no aiming title', async () => {
  getUserMedia.mockReturnValue(new Promise(() => {}))
  open()
  await flush()
  expect(screen.queryByTestId('scan-frame')).toBeNull()
  expect(screen.queryByRole('heading', { name: '對準老師投影的 QR' })).toBeNull()
})

test('frames are read only once the picture plays, and keep being read', async () => {
  jest.useFakeTimers()
  getUserMedia.mockResolvedValue(fakeStream().stream)
  open()
  await flush()
  act(() => { jest.advanceTimersByTime(SCAN_INTERVAL_MS * 3) })
  expect(detect).not.toHaveBeenCalled()
  Object.defineProperty(video(), 'videoWidth', { configurable: true, value: 1280 })
  Object.defineProperty(video(), 'videoHeight', { configurable: true, value: 720 })
  fireEvent(video(), new Event('playing'))
  await act(async () => { jest.advanceTimersByTime(SCAN_INTERVAL_MS) })
  await flush()
  expect(detect).toHaveBeenCalledWith(video(), expect.objectContaining({ width: 1280, height: 720 }))
  const reads = detect.mock.calls.length
  await act(async () => { jest.advanceTimersByTime(SCAN_INTERVAL_MS) })
  await flush()
  expect(detect.mock.calls.length).toBeGreaterThan(reads)
})

test('a QR library that fails to load goes home with S7 and stops the camera', async () => {
  jest.mocked(loadQrDetector).mockRejectedValue(new Error('chunk failed'))
  const { stream, track } = fakeStream()
  getUserMedia.mockResolvedValue(stream)
  open()
  await flush()
  await flush()
  expect(JSON.parse(where().dataset.state!)).toEqual({ scanNotice: 'unavailable' })
  expect(track.stop).toHaveBeenCalled()
})

test('one unreadable frame does not stop the scanning', async () => {
  jest.useFakeTimers()
  detect.mockRejectedValueOnce(new Error('frame not ready')).mockResolvedValue(null)
  await playing()
  await act(async () => { jest.advanceTimersByTime(SCAN_INTERVAL_MS) })
  await flush()
  await act(async () => { jest.advanceTimersByTime(SCAN_INTERVAL_MS) })
  await flush()
  expect(detect.mock.calls.length).toBeGreaterThanOrEqual(2)
  expect(where()).toHaveTextContent('/scan')
})

test('leaving stops reading frames', async () => {
  jest.useFakeTimers()
  await playing()
  await act(async () => { jest.advanceTimersByTime(SCAN_INTERVAL_MS) })
  await flush()
  fireEvent.click(screen.getByRole('button', { name: '關閉' }))
  const reads = detect.mock.calls.length
  await act(async () => { jest.advanceTimersByTime(SCAN_INTERVAL_MS * 5) })
  expect(detect.mock.calls.length).toBe(reads)
})

// S4：掃到本站的 QR。jsdom 的網址是 http://localhost/
const COURSE_QR = 'http://localhost/join?code=knb6 ze33&utm=poster'
const ACTIVITY_QR = 'https://localhost/activities/a-42/join'

async function readOnce() {
  await act(async () => { jest.advanceTimersByTime(SCAN_INTERVAL_MS) })
  await flush()
}

test('a course QR of this site shows S4, then goes to the course join page by replace', async () => {
  jest.useFakeTimers()
  detect.mockResolvedValue(COURSE_QR)
  await playing()
  await readOnce()
  expect(screen.getByRole('heading', { name: '已掃描' })).toBeInTheDocument()
  expect(screen.getByTestId('scan-frame')).toHaveAttribute('data-state', 'found')
  expect(where()).toHaveTextContent('/scan')
  act(() => { jest.advanceTimersByTime(FOUND_DELAY_MS) })
  expect(where()).toHaveTextContent('/join?code=KNB6ZE33')
  expect(screen.getByText('other-page')).toBeInTheDocument()
})

test('an activity QR of this site goes to the activity join page by replace', async () => {
  jest.useFakeTimers()
  detect.mockResolvedValue(ACTIVITY_QR)
  await playing()
  await readOnce()
  expect(screen.getByTestId('scan-frame')).toHaveAttribute('data-state', 'found')
  act(() => { jest.advanceTimersByTime(FOUND_DELAY_MS) })
  expect(where()).toHaveTextContent('/activities/a-42/join')
})

test('after going to the join page, browser back does not return to the scan page', async () => {
  jest.useFakeTimers()
  detect.mockResolvedValue(COURSE_QR)
  getUserMedia.mockResolvedValue(fakeStream().stream)
  render(<MemoryRouter future={ROUTER_FUTURE} initialEntries={['/elsewhere', '/scan']} initialIndex={1}>
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/join" element={<Home />} />
      <Route path="*" element={<p>other-page</p>} />
    </Routes>
    <Where />
  </MemoryRouter>)
  await flush()
  Object.defineProperty(video(), 'videoWidth', { configurable: true, value: 1280 })
  Object.defineProperty(video(), 'videoHeight', { configurable: true, value: 720 })
  fireEvent(video(), new Event('playing'))
  await readOnce()
  act(() => { jest.advanceTimersByTime(FOUND_DELAY_MS) })
  expect(where()).toHaveTextContent('/join?code=KNB6ZE33')
  fireEvent.click(screen.getByRole('button', { name: 'browser back' }))
  expect(where()).toHaveTextContent('/elsewhere')
})

test('reading stops once a QR is found, and the same QR held in view navigates only once', async () => {
  jest.useFakeTimers()
  detect.mockResolvedValue(COURSE_QR)
  await playing()
  await readOnce()
  const reads = detect.mock.calls.length
  await readOnce()
  await readOnce()
  expect(detect.mock.calls.length).toBe(reads)
  act(() => { jest.advanceTimersByTime(FOUND_DELAY_MS * 4) })
  expect(where()).toHaveTextContent('/join?code=KNB6ZE33')
  // 換到同一個網址兩次，網址看起來一樣，要數換頁的呼叫才看得出導了幾次
  expect(mockNavigations).toEqual([['/join?code=KNB6ZE33', { replace: true }]])
})

test('closing during S4 cancels the navigation', async () => {
  jest.useFakeTimers()
  detect.mockResolvedValue(COURSE_QR)
  const { track } = await playing()
  await readOnce()
  fireEvent.click(screen.getByRole('button', { name: '關閉' }))
  act(() => { jest.advanceTimersByTime(FOUND_DELAY_MS * 2) })
  expect(where()).toHaveTextContent(/^\/$/)
  expect(track.stop).toHaveBeenCalled()
})

test('going to the join page stops the camera', async () => {
  jest.useFakeTimers()
  detect.mockResolvedValue(ACTIVITY_QR)
  const { track } = await playing()
  await readOnce()
  act(() => { jest.advanceTimersByTime(FOUND_DELAY_MS) })
  expect(track.stop).toHaveBeenCalled()
})

// S5：掃到不認得的 QR
test.each([
  ['another site', 'https://example.com/join?code=KNB6ZE33'],
  ['another environment', 'https://qa.localhost/join?code=KNB6ZE33'],
  ['plain text', 'hello'],
])('a QR from elsewhere (%s) shows S5 and keeps the camera on', async (_, text) => {
  jest.useFakeTimers()
  detect.mockResolvedValue(text)
  const { track } = await playing()
  await readOnce()
  expect(screen.getByTestId('scan-frame')).toHaveAttribute('data-state', 'unknown')
  expect(screen.getByRole('alert')).toHaveTextContent('這不是本站的課程或活動 QR')
  expect(screen.getByRole('heading', { name: '對準老師投影的 QR' })).toBeInTheDocument()
  act(() => { jest.advanceTimersByTime(FOUND_DELAY_MS * 2) })
  expect(where()).toHaveTextContent('/scan')
  expect(track.stop).not.toHaveBeenCalled()
})

test('S5 keeps reading, and a QR of this site afterwards still goes through S4', async () => {
  jest.useFakeTimers()
  detect.mockResolvedValue('https://example.com/whatever')
  await playing()
  await readOnce()
  expect(screen.getByTestId('scan-frame')).toHaveAttribute('data-state', 'unknown')
  const reads = detect.mock.calls.length
  detect.mockResolvedValue(COURSE_QR)
  await readOnce()
  expect(detect.mock.calls.length).toBeGreaterThan(reads)
  expect(screen.getByTestId('scan-frame')).toHaveAttribute('data-state', 'found')
  expect(screen.queryByRole('alert')).toBeNull()
  act(() => { jest.advanceTimersByTime(FOUND_DELAY_MS) })
  expect(where()).toHaveTextContent('/join?code=KNB6ZE33')
})

test('the S5 notice stays while nothing new is read', async () => {
  jest.useFakeTimers()
  detect.mockResolvedValueOnce('https://example.com/whatever').mockResolvedValue(null)
  await playing()
  await readOnce()
  await readOnce()
  await readOnce()
  expect(screen.getByRole('alert')).toHaveTextContent('這不是本站的課程或活動 QR')
})

// 改用輸入代碼
async function typeCode(value: string) {
  fireEvent.click(screen.getByRole('button', { name: /改用輸入代碼/ }))
  const field = screen.getByLabelText('課程代碼')
  fireEvent.change(field, { target: { value } })
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: '加入' })) })
  return field
}

test('tapping the code button opens a code field in place and focuses it', async () => {
  getUserMedia.mockReturnValue(new Promise(() => {}))
  open()
  await flush()
  const button = screen.getByRole('button', { name: /改用輸入代碼/ })
  fireEvent.click(button)
  expect(screen.getByLabelText('課程代碼')).toHaveFocus()
  expect(screen.getByRole('button', { name: '加入' })).toBeInTheDocument()
  expect(where()).toHaveTextContent('/scan')
})

test('a correct code goes to the confirm page by replace and stops the camera', async () => {
  mockApi({ 'GET /course-join/preview?code=KNB6ZE33': { course_id: 'c-9', already_enrolled: false } })
  const { stream, track } = fakeStream()
  getUserMedia.mockResolvedValue(stream)
  render(<MemoryRouter future={ROUTER_FUTURE} initialEntries={['/elsewhere', '/scan']} initialIndex={1}>
    <Routes>
      <Route path="/scan" element={<ScanPage />} />
      <Route path="/join" element={<Home />} />
      <Route path="*" element={<p>other-page</p>} />
    </Routes>
    <Where />
  </MemoryRouter>)
  await flush()
  await typeCode(' knb6 ze33 ')
  expect(where()).toHaveTextContent('/join?code=KNB6ZE33')
  expect(JSON.parse(where().dataset.state!)).toEqual({ preview: { course_id: 'c-9', already_enrolled: false, code: 'KNB6ZE33' } })
  expect(track.stop).toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'browser back' }))
  expect(where()).toHaveTextContent('/elsewhere')
})

test('a code for a course already joined goes straight to the course page', async () => {
  mockApi({ 'GET /course-join/preview?code=KNB6ZE33': { course_id: 'c-9', already_enrolled: true } })
  getUserMedia.mockResolvedValue(fakeStream().stream)
  open()
  await flush()
  await typeCode('KNB6ZE33')
  expect(where()).toHaveTextContent('/learn/courses/c-9')
})

test('a wrong code shows the home page error above the field and keeps the camera on', async () => {
  mockApi({ 'GET /course-join/preview?code=ZZZZZZZZ': () => { throw new ApiError(404, 'ENROLL_CODE_NOT_FOUND') } })
  const { track } = await playing()
  const field = await typeCode('zzzzzzzz')
  const alert = screen.getByRole('alert')
  expect(alert).toHaveTextContent('找不到這個課程代碼')
  expect(alert).toHaveTextContent('請再對照一次老師給的 8 碼課程代碼。')
  expect(alert.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(field).toHaveAttribute('aria-invalid', 'true')
  expect(where()).toHaveTextContent('/scan')
  expect(track.stop).not.toHaveBeenCalled()
  fireEvent.change(field, { target: { value: 'A' } })
  expect(screen.queryByRole('alert')).toBeNull()
})

test('while typing in the field, a QR in view does not take the student away', async () => {
  jest.useFakeTimers()
  await playing()
  fireEvent.click(screen.getByRole('button', { name: /改用輸入代碼/ }))
  const field = screen.getByLabelText('課程代碼')
  expect(field).toHaveFocus()
  detect.mockClear().mockResolvedValue(COURSE_QR)
  await readOnce()
  await readOnce()
  act(() => { jest.advanceTimersByTime(FOUND_DELAY_MS * 2) })
  expect(detect).not.toHaveBeenCalled()
  expect(screen.getByTestId('scan-frame')).toHaveAttribute('data-state', 'aiming')
  expect(where()).toHaveTextContent('/scan')
  fireEvent.blur(field)
  await readOnce()
  expect(screen.getByTestId('scan-frame')).toHaveAttribute('data-state', 'found')
})

test('during S4 the code field is shown but cannot be used', async () => {
  jest.useFakeTimers()
  await playing()
  fireEvent.click(screen.getByRole('button', { name: /改用輸入代碼/ }))
  fireEvent.blur(screen.getByLabelText('課程代碼'))
  detect.mockResolvedValue(COURSE_QR)
  await readOnce()
  expect(screen.getByTestId('scan-frame')).toHaveAttribute('data-state', 'found')
  expect(screen.getByLabelText('課程代碼')).toBeDisabled()
  expect(screen.getByRole('button', { name: '加入' })).toBeDisabled()
})

test('during S4 the code button is shown but cannot be used', async () => {
  jest.useFakeTimers()
  detect.mockResolvedValue(COURSE_QR)
  await playing()
  await readOnce()
  expect(screen.getByRole('button', { name: /改用輸入代碼/ })).toBeDisabled()
})

test('leaving while a typed code is still being looked up does not go to the join page later', async () => {
  const pending = deferred<unknown>()
  mockApi({ 'GET /course-join/preview?code=TYPED123': () => pending.promise })
  await playing()
  await typeCode('TYPED123')
  fireEvent.click(screen.getByRole('button', { name: '關閉' }))
  const home = where().textContent
  await act(async () => { pending.resolve({ course_id: 'c-1', already_enrolled: false }) })
  await flush()
  expect(where().textContent).toBe(home)
})

test('while a typed code is being looked up, a QR in view does not take the student away', async () => {
  jest.useFakeTimers()
  const pending = deferred<unknown>()
  mockApi({ 'GET /course-join/preview?code=TYPED123': () => pending.promise })
  await playing()
  const field = await typeCode('TYPED123')
  // 點「加入」時輸入欄會失去焦點（Android 的按鈕會拿到焦點）
  fireEvent.blur(field)
  detect.mockClear().mockResolvedValue(COURSE_QR)
  await readOnce()
  await readOnce()
  act(() => { jest.advanceTimersByTime(FOUND_DELAY_MS * 2) })
  expect(screen.getByTestId('scan-frame')).toHaveAttribute('data-state', 'aiming')
  expect(where()).toHaveTextContent('/scan')
  await act(async () => { pending.resolve({ course_id: 'c-1', already_enrolled: false }) })
  await flush()
  expect(where()).toHaveTextContent('/join?code=TYPED123')
})
