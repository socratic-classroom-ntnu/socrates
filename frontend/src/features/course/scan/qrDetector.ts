import type { Region } from './cropRegion'

/** 辨識 QR 的那一層：讀 `video` 在 `region` 內的畫面，讀到就回 QR 的文字。測試只 mock 這一層。 */
export type QrDetector = { detect(video: HTMLVideoElement, region: Region): Promise<string | null> }

// 裁切後的影像縮到這個邊長以內再辨識：夠讀遠處的投影幕，又不會讓手機每一格都算很久
const MAX_SIDE = 800

type NativeBarcodeDetector = { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }
type NativeBarcodeDetectorClass = {
  new (options: { formats: string[] }): NativeBarcodeDetector
  getSupportedFormats(): Promise<string[]>
}

function frameReader() {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) throw new Error('2D canvas unavailable')
  return (video: HTMLVideoElement, region: Region) => {
    const shrink = Math.min(1, MAX_SIDE / Math.max(region.width, region.height))
    canvas.width = Math.round(region.width * shrink)
    canvas.height = Math.round(region.height * shrink)
    context.drawImage(video, region.x, region.y, region.width, region.height, 0, 0, canvas.width, canvas.height)
    return { canvas, context }
  }
}

// Android Chrome 有原生的 BarcodeDetector，比 JavaScript 快；iPhone Safari 沒有，改用 jsQR
async function nativeDetector(): Promise<QrDetector | null> {
  const Native = (window as unknown as { BarcodeDetector?: NativeBarcodeDetectorClass }).BarcodeDetector
  if (!Native) return null
  try {
    if (!(await Native.getSupportedFormats()).includes('qr_code')) return null
  } catch {
    return null
  }
  const detector = new Native({ formats: ['qr_code'] })
  const read = frameReader()
  return {
    async detect(video, region) {
      const codes = await detector.detect(read(video, region).canvas)
      return codes.find(code => code.rawValue)?.rawValue ?? null
    },
  }
}

async function scriptDetector(): Promise<QrDetector> {
  const { default: jsQR } = await import('jsqr')
  const read = frameReader()
  return {
    async detect(video, region) {
      const { canvas, context } = read(video, region)
      const image = context.getImageData(0, 0, canvas.width, canvas.height)
      // 投影的 QR 是白底黑碼，不用試反色，每一格省一半時間
      return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data || null
    },
  }
}

/** 載不起來（套件下載失敗、沒有 canvas）就丟出去，掃描頁當成相機開不起來（S7）。 */
export async function loadQrDetector(): Promise<QrDetector> {
  return (await nativeDetector()) ?? scriptDetector()
}
