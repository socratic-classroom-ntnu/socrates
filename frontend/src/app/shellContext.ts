import { createContext, useContext, useEffect } from 'react'

// 新外框已經畫了側邊欄與登出：包在裡面的舊教師頁（TeacherShell）就不要再畫一次。
export const InsideAppShell = createContext(false)

export function useInsideAppShell(): boolean {
  return useContext(InsideAppShell)
}

export type ShellBack = { to: string; label: string } | null

// 手機版頂部列左側的返回連結，由頁面宣告（C1m 的「‹ 我學的課」）。
export const ShellBackContext = createContext<(back: ShellBack) => void>(() => {})

export function useShellBack(to: string | null, label?: string): void {
  const setBack = useContext(ShellBackContext)
  useEffect(() => {
    setBack(to && label ? { to, label } : null)
    return () => setBack(null)
  }, [setBack, to, label])
}
