import { act, renderHook, waitFor } from '@testing-library/react'
import { api } from './classroomClient'
import { useResource } from './useResource'

jest.mock('./classroomClient', () => ({ api: jest.fn() }))

type Pending = { resolve(value: unknown): void }
let pending: Record<string, Pending[]> = {}
beforeEach(() => {
  pending = {}
  jest.mocked(api).mockImplementation((path: string) => new Promise(resolve => { (pending[path] ??= []).push({ resolve }) }))
})
const answer = async (path: string, value: unknown) => { await act(async () => { pending[path].shift()?.resolve(value) }) }

test('clears data when the path changes', async () => {
  const { result, rerender } = renderHook(({ path }) => useResource<{ id: string }>(path), { initialProps: { path: '/a' } })
  await answer('/a', { id: 'A' })
  expect(result.current.data).toEqual({ id: 'A' })
  rerender({ path: '/b' })
  expect(result.current.data).toBeNull()
  expect(result.current.loading).toBe(true)
  await answer('/b', { id: 'B' })
  expect(result.current.data).toEqual({ id: 'B' })
})

test('late reload from an old path is ignored', async () => {
  const { result, rerender } = renderHook(({ path }) => useResource<{ id: string }>(path), { initialProps: { path: '/a' } })
  await answer('/a', { id: 'A' })
  let reloading: Promise<void> = Promise.resolve()
  act(() => { reloading = result.current.reload() })
  rerender({ path: '/b' })
  await answer('/b', { id: 'B' })
  await answer('/a', { id: 'A again' })
  await act(async () => { await reloading })
  expect(result.current.data).toEqual({ id: 'B' })
})

test('reload on the same path keeps showing the old data until the answer arrives', async () => {
  const { result } = renderHook(() => useResource<{ id: string }>('/a'))
  await answer('/a', { id: 'A' })
  act(() => { void result.current.reload() })
  expect(result.current.data).toEqual({ id: 'A' })
  await answer('/a', { id: 'A2' })
  await waitFor(() => expect(result.current.data).toEqual({ id: 'A2' }))
})
