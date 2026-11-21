// 個人追問狀態碼（後端 personal.status）對應的畫面文字；學生端與教師端共用。
export const PERSONAL_STATUS_TEXT: Record<string, string> = {
    probing: '對話中',
    awaiting_confirm: '待確認',
    confirmed: '已確認基準',
    unclear: '暫時無法釐清',
    capped: '尚未釐清',
    incomplete: '未完成',
    unavailable: '導師暫停',
};
