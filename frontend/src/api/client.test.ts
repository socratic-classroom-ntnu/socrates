import { vi } from '../testkit'
import { createSession } from './client'

describe('api client', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('sends the learner id header on every request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ session: { id: 'abc' } }),
    })
    vi.stubGlobal('fetch', fetchMock)

    await createSession('trolley')

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers['X-Learner-Id']).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('throws with the status code so callers can distinguish 503 from 409', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }),
    )
    await expect(createSession('trolley')).rejects.toMatchObject({ status: 503 })
  })
})
