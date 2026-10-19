// 登入後要回到哪裡。整段網址（含查詢字串與錨點）都要保留：教師書籤、活動 QR 都靠這個回到原頁。
// 一次性的 verify_token、reset_token 不能跟著留下，否則重新整理又會回到驗證／重設畫面。
const ONE_TIME_PARAMS = ['verify_token', 'reset_token']
const AUTH_SCREENS = /^\/(login|verify)(\/|\?|#|$)/

export function deepLink(pathname: string, search = '', hash = ''): string {
  const params = new URLSearchParams(search)
  for (const name of ONE_TIME_PARAMS) params.delete(name)
  const query = params.toString()
  return pathname + (query ? `?${query}` : '') + hash
}

// `next` 來自網址，任何人都能改：只接受站內路徑，外部網址、//host、反斜線一律回首頁。
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return '/'
  if (raw.includes('\uFFFD')) return '/'
  try {
    decodeURI(raw)
  } catch {
    return '/'
  }
  if (AUTH_SCREENS.test(raw)) return '/'
  return raw
}

export function loginPath(pathname: string, search = '', hash = ''): string {
  return '/login?next=' + encodeURIComponent(deepLink(pathname, search, hash))
}

export type JoinTarget = { kind: 'course'; code: string } | { kind: 'activity'; activityId: string }

/** 課程邀請（/join?code=）或活動 QR（/activities/{id}/join）：登入頁據此換成 J0 版面。 */
export function joinTarget(next: string): JoinTarget | null {
  const url = new URL(next, 'http://local')
  if (url.pathname === '/join') {
    const code = url.searchParams.get('code')
    return code ? { kind: 'course', code } : null
  }
  const activity = /^\/activities\/([^/]+)\/join\/?$/.exec(url.pathname)
  return activity ? { kind: 'activity', activityId: decodeURIComponent(activity[1]) } : null
}
