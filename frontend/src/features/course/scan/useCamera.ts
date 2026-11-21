import { type RefObject, useEffect, useRef } from 'react'
import type { ScanNotice } from './scanNotice'

/** 拿到相機後，等這麼久還沒有畫面就算開不起來（S7）。 */
export const PICTURE_TIMEOUT_MS = 10_000

// 教室裡離投影幕遠、光線暗，解析度不能太低；ideal 拿不到時瀏覽器會給最接近的
const CONSTRAINTS: MediaStreamConstraints = {
  audio: false,
  video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
}

function noticeFor(error: unknown): ScanNotice {
  // 學生在系統視窗按拒絕、或直接關掉視窗，瀏覽器都回 NotAllowedError
  return (error as { name?: unknown } | null)?.name === 'NotAllowedError' ? 'denied' : 'unavailable'
}

/**
 * 掃描頁一打開就要後鏡頭，接到 `video` 上。畫面開始播放時呼叫 `onPlaying`；被拒絕或開不起來時呼叫 `onFail`。
 * 「10 秒沒畫面」從拿到相機才開始算：學生在系統視窗猶豫不算在內。
 * 卸載時停掉每個 track；卸載之後才拿到的相機也馬上停掉，手機上方的相機指示才會消失。
 */
export function useCamera(video: RefObject<HTMLVideoElement | null>, onPlaying: () => void, onFail: (notice: ScanNotice) => void) {
  const callbacks = useRef({ onPlaying, onFail })
  callbacks.current = { onPlaying, onFail }

  useEffect(() => {
    const element = video.current
    let stream: MediaStream | null = null
    let gone = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const stop = () => stream?.getTracks().forEach(track => track.stop())
    const fail = (notice: ScanNotice) => {
      if (gone) return
      clearTimeout(timer)
      stop()
      callbacks.current.onFail(notice)
    }
    const playing = () => {
      clearTimeout(timer)
      callbacks.current.onPlaying()
    }

    void (async () => {
      try {
        const devices = navigator.mediaDevices as MediaDevices | undefined
        if (!devices?.getUserMedia) throw new Error('camera API unavailable')
        const granted = await devices.getUserMedia(CONSTRAINTS)
        if (gone) {
          granted.getTracks().forEach(track => track.stop())
          return
        }
        stream = granted
        timer = setTimeout(() => fail('unavailable'), PICTURE_TIMEOUT_MS)
        if (!element) return
        element.addEventListener('playing', playing, { once: true })
        element.srcObject = granted
        // autoplay 通常就會播；play() 被擋下時交給 10 秒的上限判斷
        element.play().catch(() => {})
      } catch (error) {
        fail(noticeFor(error))
      }
    })()

    return () => {
      gone = true
      clearTimeout(timer)
      element?.removeEventListener('playing', playing)
      stop()
      if (element) element.srcObject = null
    }
  }, [video])
}
