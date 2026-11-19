// 截圖先在瀏覽器縮到長邊 1600、轉成 JPEG、壓到 700 KB 以下才送（spec P5）；後端上限 750 KB
export const MAX_SIDE = 1600
export const MAX_BYTES = 700_000
const QUALITIES = [0.85, 0.75, 0.65, 0.5]
const SHRINK = 0.8
const MIN_SCALE = 0.2

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
export const ACCEPT = 'image/png,image/jpeg,image/webp'

export type PreparedScreenshot = { mime: 'image/jpeg'; dataBase64: string; name: string; size: number }

export function isImageFile(file: File): boolean {
  return IMAGE_TYPES.has(file.type)
}

export function fitWithin(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height)
  if (longest <= max) return { width, height }
  const ratio = max / longest
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) }
}

/** 先降畫質，最低畫質還太大就把圖再縮 0.8 倍重來，直到小於上限。 */
export async function encodeUnder(
  encode: (quality: number, scale: number) => Promise<Blob>,
  limit = MAX_BYTES,
): Promise<Blob> {
  let last: Blob | null = null
  for (let scale = 1; scale >= MIN_SCALE; scale *= SHRINK) {
    for (const quality of QUALITIES) {
      last = await encode(quality, scale)
      if (last.size <= limit) return last
    }
  }
  if (!last) throw new Error('SCREENSHOT_ENCODE_FAILED')
  return last
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',', 2)[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

export async function prepareScreenshot(file: File): Promise<PreparedScreenshot> {
  const bitmap = await createImageBitmap(file)
  const base = fitWithin(bitmap.width, bitmap.height)
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  if (!context) throw new Error('SCREENSHOT_ENCODE_FAILED')
  const blob = await encodeUnder((quality, scale) => new Promise<Blob>((resolve, reject) => {
    canvas.width = Math.max(1, Math.round(base.width * scale))
    canvas.height = Math.max(1, Math.round(base.height * scale))
    // JPEG 沒有透明：先鋪白底，透明的 PNG 截圖才不會變黑
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(result => (result ? resolve(result) : reject(new Error('SCREENSHOT_ENCODE_FAILED'))), 'image/jpeg', quality)
  }))
  bitmap.close?.()
  return { mime: 'image/jpeg', dataBase64: await toBase64(blob), name: file.name || 'screenshot.jpg', size: blob.size }
}
