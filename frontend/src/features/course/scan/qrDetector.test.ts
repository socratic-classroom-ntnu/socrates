import fs from 'node:fs'
import path from 'node:path'
import jsQR from 'jsqr'
import { loadQrDetector } from './qrDetector'

// 首頁不能因為掃描變大：辨識套件只能在掃描頁動態載入
test('the QR library is only loaded with a dynamic import', () => {
  const source = fs.readFileSync(path.join(__dirname, 'qrDetector.ts'), 'utf8')
  expect(source).toMatch(/import\(\s*['"]jsqr['"]\s*\)/)
  expect(source).not.toMatch(/^\s*import\s[^(]*['"]jsqr['"]/m)
})

// jest.mock 會被提到檔案最上面，上面 import 的 jsqr 就是這個假的
jest.mock('jsqr', () => ({ __esModule: true, default: jest.fn() }))

const drawImage = jest.fn()
const getImageData = jest.fn((x: number, y: number, width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4), width, height }))
const video = {} as HTMLVideoElement
const region = { x: 100, y: 50, width: 1600, height: 1000 }

function nativeDetector(formats: string[] | Error, found: { rawValue: string }[] = []) {
  const detect = jest.fn().mockResolvedValue(found)
  const Native = jest.fn().mockImplementation(() => ({ detect }))
  Object.assign(Native, { getSupportedFormats: jest.fn(() => formats instanceof Error ? Promise.reject(formats) : Promise.resolve(formats)) })
  Object.defineProperty(window, 'BarcodeDetector', { configurable: true, value: Native })
  return { Native, detect }
}

describe('picking the reader', () => {
  beforeEach(() => {
    drawImage.mockClear()
    getImageData.mockClear()
    jest.mocked(jsQR).mockReset().mockReturnValue(null)
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage, getImageData } as unknown as CanvasRenderingContext2D)
  })
  afterEach(() => {
    jest.restoreAllMocks()
    delete (window as { BarcodeDetector?: unknown }).BarcodeDetector
  })

  test('uses the browser BarcodeDetector when it reads QR codes, on the frame region only', async () => {
    const { Native, detect } = nativeDetector(['ean_13', 'qr_code'], [{ rawValue: 'https://localhost/join?code=AB12' }])
    const reader = await loadQrDetector()
    await expect(reader.detect(video, region)).resolves.toBe('https://localhost/join?code=AB12')
    expect(Native).toHaveBeenCalledWith({ formats: ['qr_code'] })
    expect(detect).toHaveBeenCalledTimes(1)
    expect(jsQR).not.toHaveBeenCalled()
    // 裁切對準框，最長邊縮到 800：1600×1000 → 800×500
    expect(drawImage).toHaveBeenCalledWith(video, 100, 50, 1600, 1000, 0, 0, 800, 500)
  })

  test('the browser reader returns null when no QR is in view', async () => {
    nativeDetector(['qr_code'], [])
    const reader = await loadQrDetector()
    await expect(reader.detect(video, region)).resolves.toBeNull()
  })

  test.each([
    ['there is no BarcodeDetector', null],
    ['BarcodeDetector cannot read QR codes', ['ean_13']],
    ['BarcodeDetector cannot list its formats', new Error('not supported')],
  ])('falls back to jsQR when %s', async (_, formats) => {
    if (formats) nativeDetector(formats)
    jest.mocked(jsQR).mockReturnValue({ data: 'https://localhost/activities/a-1/join' } as ReturnType<typeof jsQR>)
    const reader = await loadQrDetector()
    await expect(reader.detect(video, { x: 0, y: 0, width: 400, height: 300 })).resolves.toBe('https://localhost/activities/a-1/join')
    expect(getImageData).toHaveBeenCalledWith(0, 0, 400, 300)
    expect(jsQR).toHaveBeenCalledWith(expect.any(Uint8ClampedArray), 400, 300, { inversionAttempts: 'dontInvert' })
  })

  test('jsQR finding nothing reads as null', async () => {
    const reader = await loadQrDetector()
    await expect(reader.detect(video, region)).resolves.toBeNull()
  })

  test('without a 2D canvas the reader fails to load, so the scan page shows S7', async () => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(loadQrDetector()).rejects.toThrow()
  })
})
