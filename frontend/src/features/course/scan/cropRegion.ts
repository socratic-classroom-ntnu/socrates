export type Region = { x: number; y: number; width: number; height: number }
type Box = { left: number; top: number; width: number; height: number }

/**
 * 對準框在相機影像上的範圍（影像像素）。影像用 object-fit: cover 鋪滿 `view`，所以先算出放大倍率與被裁掉的邊，
 * 再把畫面上的框換回影像座標；四周多留 `margin`（框邊長的比例），QR 貼著框邊也讀得到。
 * 框還沒有尺寸就讀整張影像；影像還沒有尺寸就沒東西可讀。
 */
export function cropRegion(video: { videoWidth: number; videoHeight: number }, view: Box, frame: Box, margin: number): Region | null {
  const { videoWidth, videoHeight } = video
  if (!videoWidth || !videoHeight) return null
  const whole = { x: 0, y: 0, width: videoWidth, height: videoHeight }
  if (view.width <= 0 || view.height <= 0 || frame.width <= 0 || frame.height <= 0) return whole

  const scale = Math.max(view.width / videoWidth, view.height / videoHeight)
  const left = view.left + (view.width - videoWidth * scale) / 2
  const top = view.top + (view.height - videoHeight * scale) / 2
  const x0 = (frame.left - frame.width * margin - left) / scale
  const y0 = (frame.top - frame.height * margin - top) / scale
  const x1 = (frame.left + frame.width * (1 + margin) - left) / scale
  const y1 = (frame.top + frame.height * (1 + margin) - top) / scale

  const x = Math.max(0, Math.round(x0))
  const y = Math.max(0, Math.round(y0))
  const width = Math.min(videoWidth, Math.round(x1)) - x
  const height = Math.min(videoHeight, Math.round(y1)) - y
  return width > 0 && height > 0 ? { x, y, width, height } : whole
}
