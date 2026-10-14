import { choosePack, type AvatarPack } from './TutorAvatar'
import { cameraPreset, placeCamera } from './runtime/runtimePack.mjs'
import { lastTutorLine } from '../../pages/GroupClassroom'

const pack = (id: string, products?: string[]): AvatarPack => ({ id, name: id, products, model_sha256: 'a'.repeat(64) })

test('CE only lists packs cleared for CE; Socratic may use non-commercial ones', () => {
  const packs = [pack('brunette', ['socratic']), pack('meshy', ['socratic', 'ce'])]
  expect(choosePack(packs, 'ce', 'brunette', null)?.id).toBe('meshy')
  expect(choosePack(packs, 'socratic', 'brunette', null)?.id).toBe('brunette')
  expect(choosePack(packs, 'socratic', 'missing', 'meshy')?.id).toBe('meshy')
  expect(choosePack(packs, 'socratic', null, null)?.id).toBe('brunette')
  expect(choosePack([pack('brunette', ['socratic'])], 'ce', null, null)).toBeNull()
})

test('the group stage speaks only the latest tutor line', () => {
  const transcript = [
    { messages: [{ role: 'tutor', text: '第一問' }, { role: 'student', text: '答' }] },
    { messages: [{ role: 'tutor', text: '第二問' }] },
  ]
  expect(lastTutorLine(transcript)).toEqual({ id: '1-0', text: '第二問' })
  expect(lastTutorLine([])).toBeNull()
})

test('camera_preset zooms in from the bottom so the top of the head stays in frame', () => {
  const preset = cameraPreset({ camera_preset: { zoom: 1.3, lift: 0, framing: 'upper-body-tight' } })
  expect(preset.framing).toBe('upper-body-tight')
  const halfView = 0.5
  const target = { x: 0, y: 1, z: 0 }
  const placed = placeCamera({ x: 0, y: 1, z: 2.6 }, target, preset, halfView)
  expect(placed.position.z).toBeCloseTo(2.0)
  // 可見範圍上緣不變：新注視點＋新半高＝舊注視點＋舊半高
  expect(placed.target.y + halfView / 1.3).toBeCloseTo(target.y + halfView)
  expect(placed.position.y).toBeCloseTo(placed.target.y)
  const lifted = placeCamera({ x: 0, y: 1, z: 2 }, target, { zoom: 1, lift: 0.1, framing: 'upper-body' }, halfView)
  expect(lifted.target.y).toBeCloseTo(1.1)
  expect(() => cameraPreset({ camera_preset: { zoom: 9 } })).toThrow('BOUNDED_CAMERA_PRESET_REQUIRED')
  expect(() => cameraPreset({ camera_preset: { lift: 'up' } })).toThrow('BOUNDED_CAMERA_PRESET_REQUIRED')
})
