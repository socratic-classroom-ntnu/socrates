/** 掃到的 QR 是什麼：本站的課程（帶整理過的代碼）、本站的活動，或不認得。 */
export type ScannedQr = { kind: 'course'; code: string } | { kind: 'activity'; id: string } | { kind: 'unknown' }

const UNKNOWN: ScannedQr = { kind: 'unknown' }
const COURSE_PATH = /^\/join\/?$/
const ACTIVITY_PATH = /^\/activities\/([^/]+)\/join\/?$/

/** 課程代碼的整理方式跟首頁代碼欄一樣：去掉所有空白、轉大寫。 */
export function normalizeCode(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase()
}

/**
 * 判斷掃到的文字是不是本站的課程或活動 QR（格式跟老師端產生的一樣：`/join?code=…`、`/activities/<id>/join`）。
 * 要是完整網址，主機和 port 要跟 `here` 一樣，http／https 不同沒關係；別的網站、別的環境（QA 的 QR 拿到正式站掃）、
 * 沒有主機的路徑、純文字、壞掉的網址一律不認得。不跟 shared/next.ts 的 joinTarget() 共用：那支不看主機、會丟例外。
 * 任何輸入都不丟例外。
 */
export function parseScannedQr(text: string, here: string): ScannedQr {
  if (!/^https?:\/\//i.test(text)) return UNKNOWN
  let url: URL
  let site: URL
  try {
    url = new URL(text)
    site = new URL(here)
  } catch {
    return UNKNOWN
  }
  if (!url.host || url.host !== site.host) return UNKNOWN

  if (COURSE_PATH.test(url.pathname)) {
    const code = normalizeCode(url.searchParams.get('code') ?? '')
    return code ? { kind: 'course', code } : UNKNOWN
  }
  const activity = ACTIVITY_PATH.exec(url.pathname)
  if (activity) {
    try {
      const id = decodeURIComponent(activity[1])
      return id ? { kind: 'activity', id } : UNKNOWN
    } catch {
      return UNKNOWN
    }
  }
  return UNKNOWN
}

/** 導頁用的路徑只用解析出來的值重組，不帶上 QR 裡的其他參數。 */
export function joinPathFor(qr: Exclude<ScannedQr, { kind: 'unknown' }>): string {
  return qr.kind === 'course'
    ? '/join?code=' + encodeURIComponent(qr.code)
    : `/activities/${encodeURIComponent(qr.id)}/join`
}
