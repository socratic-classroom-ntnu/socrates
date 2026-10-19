import { createContext, useContext } from 'react'

// 新外框已經畫了側邊欄與登出：包在裡面的舊教師頁（TeacherShell）就不要再畫一次。
export const InsideAppShell = createContext(false)

export function useInsideAppShell(): boolean {
  return useContext(InsideAppShell)
}
