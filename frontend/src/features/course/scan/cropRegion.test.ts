import { cropRegion } from './cropRegion'

const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height })

test('maps the frame into video pixels when the video is cropped left and right to cover the screen', () => {
  // 200×100 的影像鋪滿 100×100 的畫面：放大 1 倍，左右各裁掉 50
  expect(cropRegion({ videoWidth: 200, videoHeight: 100 }, rect(0, 0, 100, 100), rect(25, 25, 50, 50), 0))
    .toEqual({ x: 75, y: 25, width: 50, height: 50 })
})

test('maps the frame when the video is scaled and cropped top and bottom', () => {
  // 100×200 的影像鋪滿 200×200：放大 2 倍，上下各裁掉 100 畫面像素
  expect(cropRegion({ videoWidth: 100, videoHeight: 200 }, rect(0, 0, 200, 200), rect(50, 50, 100, 100), 0))
    .toEqual({ x: 25, y: 75, width: 50, height: 50 })
})

test('adds a margin around the frame so a QR on the edge is still read', () => {
  expect(cropRegion({ videoWidth: 200, videoHeight: 100 }, rect(0, 0, 100, 100), rect(25, 25, 50, 50), 0.2))
    .toEqual({ x: 65, y: 15, width: 70, height: 70 })
})

test('stays inside the video', () => {
  expect(cropRegion({ videoWidth: 100, videoHeight: 100 }, rect(0, 0, 100, 100), rect(-10, 80, 50, 50), 0))
    .toEqual({ x: 0, y: 80, width: 40, height: 20 })
})

test('reads the whole video when the frame has no size yet', () => {
  expect(cropRegion({ videoWidth: 640, videoHeight: 480 }, rect(0, 0, 0, 0), rect(0, 0, 0, 0), 0.15))
    .toEqual({ x: 0, y: 0, width: 640, height: 480 })
})

test('has nothing to read before the video has a size', () => {
  expect(cropRegion({ videoWidth: 0, videoHeight: 0 }, rect(0, 0, 390, 844), rect(66, 200, 258, 218), 0.15)).toBeNull()
})
