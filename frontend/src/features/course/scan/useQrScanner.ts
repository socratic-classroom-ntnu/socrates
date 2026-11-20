import { type RefObject, useEffect, useRef, useState } from 'react'
import { cropRegion } from './cropRegion'
import { type QrDetector, loadQrDetector } from './qrDetector'

/** 兩次辨識之間的間隔：一秒讀好幾次，手機也不會一直滿載。 */
export const SCAN_INTERVAL_MS = 150
// 對準框四周多讀一圈（框邊長的比例），QR 沒有完全放進框裡也讀得到
const FRAME_MARGIN = 0.15

/**
 * 頁面一打開就開始載入辨識套件（跟要相機同時進行）；`active` 時每隔一段時間讀一次對準框內的畫面，讀到 QR 就呼叫 `onText`。
 * 套件載不起來呼叫 `onLoadFail`。某一格讀失敗（例如畫面還沒準備好）就跳過，繼續下一格。
 */
export function useQrScanner(
  video: RefObject<HTMLVideoElement | null>,
  frame: RefObject<HTMLElement | null>,
  active: boolean,
  onText: (text: string) => void,
  onLoadFail: () => void,
) {
  const [detector, setDetector] = useState<QrDetector | null>(null)
  const callbacks = useRef({ onText, onLoadFail })
  callbacks.current = { onText, onLoadFail }

  useEffect(() => {
    let gone = false
    loadQrDetector().then(
      loaded => { if (!gone) setDetector(loaded) },
      () => { if (!gone) callbacks.current.onLoadFail() },
    )
    return () => { gone = true }
  }, [])

  useEffect(() => {
    if (!active || !detector) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const tick = async () => {
      const element = video.current
      const region = element && cropRegion(element, element.getBoundingClientRect(), frame.current?.getBoundingClientRect() ?? element.getBoundingClientRect(), FRAME_MARGIN)
      if (element && region) {
        try {
          const text = await detector.detect(element, region)
          if (stopped) return
          if (text) callbacks.current.onText(text)
        } catch {
          // 這一格讀不到就算了，下一格再讀
        }
      }
      if (!stopped) timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS)
    }
    timer = setTimeout(() => void tick(), SCAN_INTERVAL_MS)

    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [active, detector, video, frame])
}
