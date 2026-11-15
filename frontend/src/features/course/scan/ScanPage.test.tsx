import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { Where } from '../../../testing/pageHarness'
import { PICTURE_TIMEOUT_MS } from './useCamera'
import { ScanPage } from './ScanPage'

const originalMediaDevices = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices')
const getUserMedia = jest.fn()

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
  return render(<MemoryRouter initialEntries={['/elsewhere', '/scan']} initialIndex={1}>
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
