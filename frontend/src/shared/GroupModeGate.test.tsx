import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { getPublicConfig } from '../contract/classroomClient'
import { applyLocale } from '../i18n'
import { GroupModeGate, groupModeAllowed } from './GroupModeGate'
import { PublicConfigProvider, useFeatures } from './publicConfig'

jest.mock('../contract/classroomClient', () => ({ getPublicConfig: jest.fn() }))
const config = getPublicConfig as jest.Mock

function Page() {
  return <p>多人頁內容</p>
}

function renderAt(path: string, provider: 'fetch' | { group_mode: boolean } = 'fetch') {
  const tree = <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route element={<GroupModeGate />}>
        <Route path="/groups" element={<Page />} />
        <Route path="/classrooms/:roomId" element={<Page />} />
        <Route path="/teacher/home" element={<Page />} />
      </Route>
    </Routes>
  </MemoryRouter>
  return render(provider === 'fetch'
    ? <PublicConfigProvider>{tree}</PublicConfigProvider>
    : <PublicConfigProvider initial={provider}>{tree}</PublicConfigProvider>)
}

beforeEach(async () => {
  await applyLocale('zh-Hant')
  config.mockReset()
})

test('the providers view of /groups and the bank, store and settings views of /teacher/home stay open', () => {
  expect(groupModeAllowed('/groups', '?view=providers')).toBe(true)
  expect(groupModeAllowed('/teacher/home', '?view=bank')).toBe(true)
  expect(groupModeAllowed('/teacher/home', '?view=store')).toBe(true)
  expect(groupModeAllowed('/teacher/home', '?view=settings')).toBe(true)
  expect(groupModeAllowed('/groups', '')).toBe(false)
  expect(groupModeAllowed('/teacher/home', '')).toBe(false)
  expect(groupModeAllowed('/classrooms/r1', '?view=providers')).toBe(false)
})

test('while the config loads the page is not mounted', async () => {
  let answer: (value: unknown) => void = () => undefined
  config.mockReturnValue(new Promise(resolve => { answer = resolve }))
  renderAt('/classrooms/r1')
  expect(screen.queryByText('多人頁內容')).toBeNull()
  await act(async () => { answer({ features: { group_mode: true } }) })
  expect(screen.getByText('多人頁內容')).toBeInTheDocument()
})

test('when group mode is off the page says so instead', async () => {
  config.mockResolvedValue({ features: { group_mode: false } })
  renderAt('/classrooms/r1')
  expect(await screen.findByRole('heading', { name: '多人模式目前沒有開放' })).toBeInTheDocument()
  expect(screen.queryByText('多人頁內容')).toBeNull()
})

test('a config that cannot be read counts as off', async () => {
  config.mockRejectedValue(new Error('offline'))
  renderAt('/groups')
  expect(await screen.findByRole('heading', { name: '多人模式目前沒有開放' })).toBeInTheDocument()
  expect(screen.queryByText('多人頁內容')).toBeNull()
})

test('allowed views render even while group mode is off', async () => {
  config.mockResolvedValue({ features: { group_mode: false } })
  renderAt('/teacher/home?view=bank')
  expect(await screen.findByText('多人頁內容')).toBeInTheDocument()
})

test('refresh reads the config again', async () => {
  config.mockResolvedValueOnce({ features: { group_mode: true } }).mockResolvedValueOnce({ features: { group_mode: false } })
  let refresh: () => Promise<void> = async () => undefined
  function Grab() { refresh = useFeatures().refresh; return null }
  render(<PublicConfigProvider><Grab /></PublicConfigProvider>)
  await waitFor(() => expect(config).toHaveBeenCalledTimes(1))
  await act(async () => { await refresh() })
  expect(config).toHaveBeenCalledTimes(2)
})

test('given a starting value it does not fetch', () => {
  renderAt('/groups', { group_mode: true })
  expect(screen.getByText('多人頁內容')).toBeInTheDocument()
  expect(config).not.toHaveBeenCalled()
})

test('while loading it shows the loading screen it is given', () => {
  config.mockReturnValue(new Promise(() => undefined))
  render(<PublicConfigProvider><MemoryRouter initialEntries={['/groups']}><Routes>
    <Route element={<GroupModeGate loading={<p>載入畫面</p>} />}><Route path="/groups" element={<Page />} /></Route>
  </Routes></MemoryRouter></PublicConfigProvider>)
  expect(screen.getByText('載入畫面')).toBeInTheDocument()
})
