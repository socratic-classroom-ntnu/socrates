import { typedApi } from './classroomClient'
import { avatarSrc, deleteAvatar, uploadAvatar } from './accountClient'

jest.mock('./classroomClient', () => ({ typedApi: jest.fn() }))

beforeEach(() => jest.mocked(typedApi).mockReset())

test('the cropped picture goes up as base64 JSON, like a feedback screenshot', async () => {
  jest.mocked(typedApi).mockResolvedValue({ avatar_updated_at: 12.5 } as never)
  const jpeg = new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0x01])], { type: 'image/jpeg' })

  await uploadAvatar(jpeg)

  expect(typedApi).toHaveBeenCalledWith('/account/avatar', 'PUT', {
    body: { mime: 'image/jpeg', data_base64: '/9j/AQ==' },
  })
})

test('deleting goes through the typed client', async () => {
  jest.mocked(typedApi).mockResolvedValue({ avatar_updated_at: null } as never)

  await deleteAvatar()

  expect(typedApi).toHaveBeenCalledWith('/account/avatar', 'DELETE')
})

test('the picture URL carries the version, and there is none without an avatar', () => {
  expect(avatarSrc({ avatar_updated_at: 1700000000.25 })).toBe('/api/v2/account/avatar?v=1700000000.25')
  expect(avatarSrc({ avatar_updated_at: null })).toBeUndefined()
  expect(avatarSrc({})).toBeUndefined()
  expect(avatarSrc(null)).toBeUndefined()
})
