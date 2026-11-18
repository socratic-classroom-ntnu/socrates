import { useEffect, useState } from 'react'

// 回饋按鈕浮在頁面底部固定的東西上方（手機的底部導覽、對話頁的輸入區，spec P2）。
// 那些元素只要加 data-feedback-avoid，不必 import 這個模組；這裡找出佔住右下角的那幾個，取最高的頂端
const SELECTOR = '[data-feedback-avoid]'
const GAP = 12
const NEAR_BOTTOM = 160

export function bottomOffset(base: number, buttonWidth: number, right: number): number {
  const height = window.innerHeight
  const width = window.innerWidth
  let offset = base
  for (const element of Array.from(document.querySelectorAll<HTMLElement>(SELECTOR))) {
    const rect = element.getBoundingClientRect()
    const visible = rect.width > 0 && rect.height > 0
    const atBottom = rect.bottom >= height - NEAR_BOTTOM && rect.top < height
    const underButton = rect.right > width - right - buttonWidth && rect.left < width - right
    if (visible && atBottom && underButton) offset = Math.max(offset, height - rect.top + GAP)
  }
  return offset
}

/** 按鈕的 bottom（px）：頁面變動、捲動、視窗大小改變時重算。 */
export function useFloatingBottom(base: number, buttonWidth: number, right: number, enabled: boolean): number {
  const [bottom, setBottom] = useState(base)
  useEffect(() => {
    if (!enabled) return
    let frame = 0
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setBottom(bottomOffset(base, buttonWidth, right)))
    }
    update()
    const observer = typeof MutationObserver === 'function' ? new MutationObserver(update) : null
    observer?.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] })
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [base, buttonWidth, right, enabled])
  return enabled ? bottom : base
}
