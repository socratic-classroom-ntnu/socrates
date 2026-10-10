// 導師暫停回應（沒有可用的 LLM、額度用完或連不上）時，顯示後端給的原因；其他狀態不顯示。
export function FocusNotice({ status, message }: { status?: string | null; message?: string | null }) {
    if (status !== 'TUTOR_UNAVAILABLE' || !message)
        return null;
    return <p role="status" className="r2-focus-notice">{message}</p>;
}
