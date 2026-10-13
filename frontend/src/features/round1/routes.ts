// Round 1（單人對話）與共思教室共用同一個網址空間：App.tsx 依網址開頭決定整頁掛哪一個 app。
// "/" 屬於共思教室；Round 1 自己的首頁網址是 "/round1"，這樣重新整理後仍留在 Round 1。
// Round1App 的路由器裡也有 "/"，但在那裡 navigate('/') 會讓網址變成 "/"、畫面卻是 Round 1 首頁，
// 一重新整理就換成共思教室首頁。Round 1 內部要回首頁一律用 ROUND1_HOME。
export const ROUND1_HOME = '/round1'
// 離開 Round 1 回共思教室首頁要整頁載入（<a href>），不能交給 Round 1 的路由器；登入 Session 在 cookie，不會登出。
export const CLASSROOM_HOME = '/'

export function isRound1Path(pathname: string): boolean {
  return /^\/(round1|history|sessions)(\/|$)/.test(pathname)
}
