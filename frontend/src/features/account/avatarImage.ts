// 頭像的圖片處理：讀檔與裁切都碰瀏覽器的 Image／canvas，獨立出來，流程元件才測得到。
// 存的是裁好的正方形、縮成 256×256、壓成 JPEG（需求；壓縮做法同 features/feedback/screenshot.ts）。

export const OUTPUT_SIZE = 256

/** 把選到的檔案讀成 <img>；讀不了（壞檔、不是圖片）就 reject。 */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('IMAGE_UNREADABLE'))
    image.src = url
  })
}

/** 裁切區的位置：圖片在裁切框裡畫多大、往哪邊移（以裁切框的像素計）。 */
export type CropPlacement = { frame: number; width: number; height: number; x: number; y: number }

export async function cropToJpeg(image: HTMLImageElement, placement: CropPlacement): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = OUTPUT_SIZE
  canvas.height = OUTPUT_SIZE
  const context = canvas.getContext('2d')
  if (!context) throw new Error('CANVAS_UNAVAILABLE')

  const ratio = OUTPUT_SIZE / placement.frame
  const width = placement.width * ratio
  const height = placement.height * ratio
  // JPEG 沒有透明：PNG 的透明處先鋪白底
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(image, (OUTPUT_SIZE - width) / 2 + placement.x * ratio, (OUTPUT_SIZE - height) / 2 + placement.y * ratio, width, height)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => (result ? resolve(result) : reject(new Error('CROP_FAILED'))), 'image/jpeg', 0.85)
  })
}
