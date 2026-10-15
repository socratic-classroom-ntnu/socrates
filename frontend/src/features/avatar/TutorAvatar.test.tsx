import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TutorAvatar } from './TutorAvatar'
import { playRecordedDialogue } from './recordedDialogue'
import { loadAvatarCatalog, type AvatarPack } from '../../api/avatarCatalog'
import { planSpeech } from './speech'

// Isolate WebGL/recorded audio; the real component and classroom speech lifecycle run.
jest.mock('./runtime/packPresenter.mjs', () => ({ PackPresenter: class {
  load(pack: AvatarPack) { return mockLoadModel(pack) }
  setMood() {}
  stop() {}
  stopSpeech() { mockStopSpeech() }
  prepareAudio() { return Promise.resolve() }
  speakTimeline(...args: unknown[]) { mockSpeakTimeline(...args) }
  alignSpeech() {}
  dispose() { mockDispose(); return Promise.resolve() }
} }))
jest.mock('../../api/classroomClient', () => ({ getPublicConfig: async () => ({ debug_mode: true }) }))
jest.mock('../../api/avatarCatalog', () => ({ ...jest.requireActual('../../api/avatarCatalog'), loadAvatarCatalog: jest.fn() }))
jest.mock('./recordedDialogue', () => ({ ...jest.requireActual('./recordedDialogue'), playRecordedDialogue: jest.fn() }))

let complete: () => void
let mockModelLoad: Promise<void> | undefined
const fixturePacks: AvatarPack[] = [
  { id: 'fixture', name: 'Fixture', products: ['socratic'], model_sha256: 'a'.repeat(64) },
  { id: 'second', name: 'Second fixture', products: ['socratic', 'ce'], model_sha256: 'b'.repeat(64) },
]
const mockLoadModel = jest.fn<Promise<void>, [AvatarPack]>(() => mockModelLoad ?? Promise.resolve())
const mockSpeakTimeline = jest.fn()
const mockStopSpeech = jest.fn()
const mockDispose = jest.fn()
beforeEach(() => {
  mockModelLoad = undefined
  jest.mocked(loadAvatarCatalog).mockReset().mockResolvedValue(fixturePacks)
  mockLoadModel.mockReset().mockImplementation(() => mockModelLoad ?? Promise.resolve())
  mockSpeakTimeline.mockClear()
  mockStopSpeech.mockClear()
  mockDispose.mockClear()
  window.localStorage.clear()
  jest.mocked(playRecordedDialogue).mockClear().mockImplementation((_presenter, signal) => new Promise(resolve => {
    complete = () => resolve({ state: 'COMPLETED' })
    signal.addEventListener('abort', () => resolve({ state: 'SUPERSEDED' }), { once: true })
  }))
})
async function recording() {
  await waitFor(() => expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready'))
  fireEvent.click(screen.getByText('人像選擇（開發）'))
  fireEvent.click(screen.getByRole('button', { name: '重播既有錄音對話' }))
  expect(screen.getByRole('status')).toHaveTextContent('loading')
}

test('a new tutor line waits for model loading before it starts speaking', async () => {
  let loaded: () => void
  mockModelLoad = new Promise(resolve => { loaded = resolve })
  const view = render(<TutorAvatar product="socratic" />)
  await act(async () => {})
  view.rerender(<TutorAvatar product="socratic" say={{ id: 'first', text: '人像載入時到達的導師訊息' }}/>)
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'loading')
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-state', 'idle')
  await act(async () => loaded())
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready')
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-state', 'speaking')
})

test('a tutor line arriving with a model change waits for that model, not the old presenter', async () => {
  const view = render(<TutorAvatar product="socratic" packId="fixture" />)
  await waitFor(() => expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready'))
  let loaded: () => void
  mockModelLoad = new Promise(resolve => { loaded = resolve })
  view.rerender(<TutorAvatar product="socratic" packId="second" say={{ id: 'next-model', text: '切換模型同時到達的導師訊息' }} />)
  await act(async () => {})
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-state', 'idle')
  await act(async () => loaded())
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-id', 'second')
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready')
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-state', 'speaking')
})

test('the first tutor line arriving after an empty mount is spoken without a recording', async () => {
  const view = render(<TutorAvatar product="socratic" />)
  await waitFor(() => expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready'))
  view.rerender(<TutorAvatar product="socratic" say={{ id: 'first', text: '掛載後到達的導師回覆' }}/>)
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-state', 'speaking')
})

test('an existing entry message stays silent until a genuinely new tutor line arrives', async () => {
  const view = render(<TutorAvatar product="socratic" say={{ id: 'old', text: '進頁前的訊息' }}/>)
  await waitFor(() => expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready'))
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-state', 'idle')
  view.rerender(<TutorAvatar product="socratic" say={{ id: 'new', text: '掛載後到達的導師回覆' }}/>)
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-state', 'speaking')
})

test('a tutor line arriving during a recording is spoken after that recording completes', async () => {
  const view = render(<TutorAvatar product="socratic" say={{ id: 'old', text: '進頁前的訊息' }}/>)
  await recording()
  view.rerender(<TutorAvatar product="socratic" say={{ id: 'new', text: '錄音期間到達的教室導師訊息' }}/>)
  await act(async () => complete())
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-state', 'speaking')
})

test('the first tutor line received during recording is not mistaken for an old entry message', async () => {
  const view = render(<TutorAvatar product="socratic" />)
  await recording()
  view.rerender(<TutorAvatar product="socratic" say={{ id: 'first', text: '錄音期間才到達的第一則導師訊息' }}/>)
  await act(async () => complete())
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-state', 'speaking')
})

test('muting during recording leaves a stopped visible replay state and an idle avatar', async () => {
  render(<TutorAvatar product="socratic" say={{ id: 'old', text: '進頁前的訊息' }}/>)
  await recording()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: '語音開' })))
  expect(screen.getByRole('status')).toHaveTextContent('STOPPED')
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-state', 'idle')
})

test('changing models during a recording stops that replay visibly without leaving loading state', async () => {
  render(<TutorAvatar product="socratic" />)
  await recording()
  await act(async () => fireEvent.change(screen.getByLabelText('模型'), { target: { value: 'second' } }))
  expect(screen.getByRole('status')).toHaveTextContent('STOPPED')
  await waitFor(() => expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready'))
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-state', 'idle')
})

test('muted playback stays unavailable until the user enables voice again', async () => {
  window.localStorage.setItem('avatar-voice', 'off')
  render(<TutorAvatar product="socratic" />)
  await waitFor(() => expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready'))
  fireEvent.click(screen.getByText('人像選擇（開發）'))
  expect(screen.getByRole('button', { name: '重播既有錄音對話' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('idle')
  fireEvent.click(screen.getByRole('button', { name: '語音關' }))
  expect(screen.getByRole('button', { name: '重播既有錄音對話' })).toBeEnabled()
})

test('CE selection and the debug menu require explicit product permission', async () => {
  const unspecified = { id: 'unspecified', name: 'Unspecified license', model_sha256: 'c'.repeat(64) }
  jest.mocked(loadAvatarCatalog).mockResolvedValue([unspecified, ...fixturePacks])
  window.localStorage.setItem('avatar-pack:ce', 'unspecified')
  const view = render(<TutorAvatar product="ce" packId="unspecified" />)
  await waitFor(() => expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready'))
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-id', 'second')
  fireEvent.click(screen.getByText('人像選擇（開發）'))
  expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Second fixture'])
  view.rerender(<TutorAvatar product="socratic" packId="unspecified" />)
  await waitFor(() => expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-id', 'unspecified'))
  fireEvent.click(screen.getByText('人像選擇（開發）'))
  expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Unspecified license', 'Fixture', 'Second fixture'])
})

test('Socratic runtime lists the same eligible packs and never substitutes a saved incompatible model', async () => {
  const ceOnly = { id: 'ce-only', name: 'CE only', products: ['ce'], model_sha256: 'c'.repeat(64) }
  const unspecified = { id: 'unspecified', name: 'Unspecified license', model_sha256: 'd'.repeat(64) }
  const empty = { id: 'empty', name: 'No products', products: [], model_sha256: 'e'.repeat(64) }
  jest.mocked(loadAvatarCatalog).mockResolvedValue([ceOnly, ...fixturePacks, unspecified, empty])
  window.localStorage.setItem('avatar-pack:socratic', 'second')
  const view = render(<TutorAvatar product="socratic" packId="ce-only" />)
  expect(await screen.findByText(/設定的人像「ce-only」不適用於 Socratic 或已不在模型清單/)).toBeInTheDocument()
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-id', 'none')
  expect(mockLoadModel).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('人像選擇（開發）'))
  expect(screen.getAllByRole('option').map(option => option.textContent)).toEqual(['Fixture', 'Second fixture', 'Unspecified license'])

  view.rerender(<TutorAvatar product="socratic" packId="second" />)
  await waitFor(() => expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready'))
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-id', 'second')
  expect(mockLoadModel.mock.calls.map(([pack]) => pack.id)).toEqual(['second'])
  expect(screen.queryByText(/設定的人像「ce-only」/)).not.toBeInTheDocument()
})

test('a failed catalog can be reloaded into a usable model', async () => {
  jest.mocked(loadAvatarCatalog).mockRejectedValueOnce(Error('CATALOG_UNAVAILABLE'))
  render(<TutorAvatar product="socratic" />)
  fireEvent.click(await screen.findByRole('button', { name: '重新載入人像' }))
  await waitFor(() => expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready'))
  expect(loadAvatarCatalog).toHaveBeenCalledTimes(2)
  expect(mockLoadModel).toHaveBeenCalledWith(fixturePacks[0])
  fireEvent.click(screen.getByText('人像選擇（開發）'))
  expect(screen.getByRole('button', { name: '重播既有錄音對話' })).toBeEnabled()
  expect(screen.queryByRole('button', { name: '重新載入人像' })).not.toBeInTheDocument()
})

test('a failed model retry refreshes the catalog and waits for the newly selected presenter', async () => {
  mockLoadModel.mockRejectedValueOnce(Error('MODEL_UNAVAILABLE'))
  render(<TutorAvatar product="socratic" say={{ id: 'entry', text: '進頁前的訊息重試後仍不應重播' }} />)
  await screen.findByRole('button', { name: '重新載入人像' })
  let loaded!: () => void
  mockModelLoad = new Promise(resolve => { loaded = resolve })
  jest.mocked(loadAvatarCatalog).mockResolvedValueOnce([fixturePacks[1]])
  fireEvent.click(screen.getByRole('button', { name: '重新載入人像' }))
  await waitFor(() => expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-id', 'second'))
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'loading')
  fireEvent.click(screen.getByText('人像選擇（開發）'))
  expect(screen.getByRole('button', { name: '重播既有錄音對話' })).toBeDisabled()
  expect(loadAvatarCatalog).toHaveBeenCalledTimes(2)
  expect(mockLoadModel.mock.calls.map(([pack]) => pack.id)).toEqual(['fixture', 'second'])
  expect(mockDispose).toHaveBeenCalledTimes(1)
  await act(async () => loaded())
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready')
  expect(screen.getByRole('button', { name: '重播既有錄音對話' })).toBeEnabled()
  expect(mockSpeakTimeline).not.toHaveBeenCalled()
})

test.each(['product', 'pack'] as const)('a late catalog cannot replace the selection after a %s change', async change => {
  let finish!: (packs: AvatarPack[]) => void
  jest.mocked(loadAvatarCatalog).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const view = render(<TutorAvatar product="socratic" packId="fixture" />)
  const oldSignal = jest.mocked(loadAvatarCatalog).mock.calls[0][0]
  view.rerender(<TutorAvatar product={change === 'product' ? 'ce' : 'socratic'} packId="second" />)
  await waitFor(() => expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready'))
  expect(oldSignal?.aborted).toBe(true)
  await act(async () => finish([fixturePacks[0]]))
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-id', 'second')
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready')
  expect(mockLoadModel.mock.calls.map(([pack]) => pack.id)).toEqual(['second'])
})

test.each(['resolve', 'reject'] as const)('a superseded model cannot %s into the new selection', async outcome => {
  let finish!: () => void
  let fail!: (error: Error) => void
  mockLoadModel.mockReturnValueOnce(new Promise((resolve, reject) => { finish = resolve; fail = reject }))
  render(<TutorAvatar product="socratic" />)
  await waitFor(() => expect(mockLoadModel).toHaveBeenCalledTimes(1))
  fireEvent.click(screen.getByText('人像選擇（開發）'))
  fireEvent.change(screen.getByLabelText('模型'), { target: { value: 'second' } })
  await waitFor(() => expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready'))
  await act(async () => { if (outcome === 'resolve') finish(); else fail(Error('OLD_MODEL_FAILED')) })
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-id', 'second')
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-render-status', 'ready')
})

test('unmount aborts a pending catalog and ignores its late result', async () => {
  let finish!: (packs: AvatarPack[]) => void
  jest.mocked(loadAvatarCatalog).mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const view = render(<TutorAvatar product="socratic" />)
  const signal = jest.mocked(loadAvatarCatalog).mock.calls[0][0]
  view.unmount()
  expect(signal?.aborted).toBe(true)
  await act(async () => finish(fixturePacks))
  expect(mockLoadModel).not.toHaveBeenCalled()
})

test('unmount disposes a loading presenter before its model settles', async () => {
  let loaded!: () => void
  mockModelLoad = new Promise(resolve => { loaded = resolve })
  const view = render(<TutorAvatar product="socratic" />)
  await waitFor(() => expect(mockLoadModel).toHaveBeenCalledTimes(1))
  view.unmount()
  expect(mockDispose).toHaveBeenCalledTimes(1)
  await act(async () => loaded())
  expect(screen.queryByTestId('avatar-stage')).not.toBeInTheDocument()
  expect(mockSpeakTimeline).not.toHaveBeenCalled()
})

test('stopping a recording immediately starts only the latest deferred line, even before the recording settles', async () => {
  let finish!: () => void
  let signal!: AbortSignal
  jest.mocked(playRecordedDialogue).mockImplementationOnce((_presenter, abortSignal) => {
    signal = abortSignal
    return new Promise(resolve => { finish = () => resolve({ state: 'SUPERSEDED' }) })
  })
  const view = render(<TutorAvatar product="socratic" say={{ id: 'entry', text: '進頁前舊訊息' }} />)
  await recording()
  view.rerender(<TutorAvatar product="socratic" say={{ id: 'deferred', text: '被後一則取代的訊息' }} />)
  const latest = { id: 'latest', text: '停止錄音後應開始的最新導師訊息' }
  view.rerender(<TutorAvatar product="socratic" say={latest} />)
  expect(mockSpeakTimeline).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: '停止錄音' }))
  expect(signal.aborted).toBe(true)
  expect(screen.getByRole('button', { name: '停止錄音' })).toBeDisabled()
  expect(screen.getByRole('status')).toHaveTextContent('STOPPED')
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-state', 'speaking')
  const plan = planSpeech(latest.text)
  expect(mockSpeakTimeline).toHaveBeenCalledTimes(1)
  expect(mockSpeakTimeline).toHaveBeenCalledWith(plan.events, plan.durationMs)
  await act(async () => finish())
  expect(screen.getByRole('status')).toHaveTextContent('STOPPED')
  expect(screen.getByTestId('avatar-stage')).toHaveAttribute('data-avatar-state', 'speaking')
  expect(mockStopSpeech).not.toHaveBeenCalled()
})

test('unmount cancels a recording without starting its deferred tutor line', async () => {
  const view = render(<TutorAvatar product="socratic" />)
  await recording()
  const signal = jest.mocked(playRecordedDialogue).mock.calls[0][1]
  view.rerender(<TutorAvatar product="socratic" say={{ id: 'deferred', text: '離頁後不應發聲的訊息' }} />)
  view.unmount()
  expect(signal.aborted).toBe(true)
  await act(async () => {})
  expect(mockSpeakTimeline).not.toHaveBeenCalled()
  expect(mockDispose).toHaveBeenCalledTimes(1)
})
