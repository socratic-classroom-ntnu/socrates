// 回饋按鈕只在全螢幕頁不出現：掃描頁（相機畫面）與投影頁（spec P1）。結尾斜線不影響
const HIDDEN = [/^\/scan\/?$/, /^\/teach\/courses\/[^/]+\/projector\/?$/, /^\/teach\/activities\/[^/]+\/projector\/?$/]

export function hiddenOn(pathname: string): boolean {
  return HIDDEN.some(pattern => pattern.test(pathname))
}
