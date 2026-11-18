/**
 * 掃描頁回首頁時，用 location.state 交給首頁的對話框：denied 是 S6（沒有相機權限），unavailable 是 S7（相機無法開啟）。
 * 放在 state 而不是網址，重新整理後就不會再跳出來。
 */
export type ScanNotice = 'denied' | 'unavailable'

export type ScanNoticeState = { scanNotice: ScanNotice }
