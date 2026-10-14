import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TutorAvatar } from './TutorAvatar'
import { playRecordedDialogue } from './recordedDialogue'

// Isolate WebGL/recorded audio; the real component and classroom speech lifecycle run.
jest.mock('./runtime/packPresenter.mjs', () => ({ PackPresenter: class {
  load() { return mockModelLoad ?? Promise.resolve() }
  setMood() {}
  stop() {}
  stopSpeech() {}
  prepareAudio() { return Promise.resolve() }
  speakTimeline() {}
  alignSpeech() {}
  dispose() { return Promise.resolve() }
} }))
jest.mock('../../api/classroomClient', () => ({ getPublicConfig: async () => ({ debug_mode: true }) }))
jest.mock('../../api/avatarCatalog', () => ({ loadAvatarCatalog: async () => [
  { id: 'fixture', name: 'Fixture', products: ['socratic'], model_sha256: 'a'.repeat(64) },
  { id: 'second', name: 'Second fixture', products: ['socratic'], model_sha256: 'b'.repeat(64) },
] }))
jest.mock('./recordedDialogue', () => ({ ...jest.requireActual('./recordedDialogue'), playRecordedDialogue: jest.fn() }))

let complete: () => void
let mockModelLoad: Promise<void> | undefined
beforeEach(() => {
  mockModelLoad = undefined
  window.localStorage.clear()
  jest.mocked(playRecordedDialogue).mockImplementation((_presenter, signal) => new Promise(resolve => {
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
