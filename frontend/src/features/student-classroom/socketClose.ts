/** 伺服器以 4403 關掉教室連線（多人模式被關、或沒有權限）：不該再重連（後台 spec P27）。 */
export function closedByGroupMode(code?: number): boolean {
  return code === 4403
}
