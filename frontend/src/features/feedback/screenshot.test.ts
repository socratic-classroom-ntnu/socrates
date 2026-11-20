import { MAX_BYTES, MAX_SIDE, encodeUnder, fitWithin, isImageFile } from './screenshot'

test('a large screenshot is scaled so its long side is 1600, keeping its shape', () => {
  expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200 })
  expect(fitWithin(1170, 2532)).toEqual({ width: 739, height: 1600 })
  expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  expect(MAX_SIDE).toBe(1600)
})

test('only png, jpeg and webp count as images', () => {
  expect(isImageFile(new File([], 'a.png', { type: 'image/png' }))).toBe(true)
  expect(isImageFile(new File([], 'a.jpg', { type: 'image/jpeg' }))).toBe(true)
  expect(isImageFile(new File([], 'a.webp', { type: 'image/webp' }))).toBe(true)
  expect(isImageFile(new File([], 'a.gif', { type: 'image/gif' }))).toBe(false)
  expect(isImageFile(new File([], 'a.pdf', { type: 'application/pdf' }))).toBe(false)
})

function blob(size: number) {
  return new Blob([new Uint8Array(size)], { type: 'image/jpeg' })
}

test('the encoder lowers the quality until the jpeg fits under 700 KB', async () => {
  const tried: number[] = []
  const result = await encodeUnder(async (quality, scale) => {
    tried.push(quality)
    expect(scale).toBe(1)
    return blob(quality > 0.6 ? 900_000 : 500_000)
  })
  expect(MAX_BYTES).toBe(700_000)
  expect(result.size).toBe(500_000)
  expect(tried[0]).toBe(0.85)
  expect(Math.min(...tried)).toBeGreaterThanOrEqual(0.5)
})

test('when even the lowest quality is too big it shrinks the picture and tries again', async () => {
  const scales: number[] = []
  const result = await encodeUnder(async (quality, scale) => {
    scales.push(scale)
    return blob(scale >= 0.8 ? 2_000_000 : 300_000)
  })
  expect(result.size).toBe(300_000)
  expect(scales.at(-1)).toBeLessThan(0.8)
})
