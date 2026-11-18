// Sc1 每台手機只出現一次：iPhone Safari 幾乎每次都回報「還沒問過」，每次都說明等於讓學生被問兩次。
// 存不了（無痕、封鎖網站資料）就當作沒看過，每次都說明。
export const INTRO_SEEN_KEY = 'socrates.scan.introSeen'

export function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1'
  } catch {
    return false
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1')
  } catch {
    // 存不了就下次再說明一次
  }
}
