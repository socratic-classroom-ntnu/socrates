// 彈出面板的進場／退場：關閉時先播退場動畫，播完才真的通知外面卸載。
import { useCallback, useEffect, useRef, useState } from 'react';

const EXIT_MS = 140;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function useClosing(onClosed: () => void) {
    const [closing, setClosing] = useState(false);
    const timer = useRef<number>();
    useEffect(() => () => window.clearTimeout(timer.current), []);
    const close = useCallback(() => {
        if (reducedMotion()) { onClosed(); return; }
        setClosing(true);
        timer.current = window.setTimeout(onClosed, EXIT_MS);
    }, [onClosed]);
    return [closing, close] as const;
}
