// 開始／結束時間的選擇器。對應 Figma「日期選擇器」與「時間選擇器」：先選日期，再選時間，按確認才寫回欄位。
// 值的格式是本地時間 "YYYY-MM-DDTHH:mm"，同格式的字串可以直接比大小。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, WheelEvent as ReactWheelEvent } from 'react';
import { useClosing } from './usePresence';

const pad2 = (n: number) => String(n).padStart(2, '0');
const dateKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

export function formatDate(value: string) {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return `${y}年${m}月${d}日`;
}
export const formatTime = (value: string) => value.slice(11, 16);

type Props = {
    label: string; // 「開始時間」或「結束時間」
    value: string | null;
    minDate: string; // 最早可以選的日期 "YYYY-MM-DD"，更早的日期顯示成灰色
    defaultTime: string; // 還沒選過時，時間選擇器一開始停在哪裡 "HH:mm"
    anchor: RefObject<HTMLElement>; // 打開選擇器的那個欄位；選擇器會出現在它下面（放不下就放上面）
    onConfirm: (value: string) => void;
    onClose: () => void;
};

const EDGE = 8; // 離視窗邊緣、離欄位至少留這麼多
type Position = { top: number; left: number; above: boolean };

// 算出選擇器要放在哪：欄位下方靠左對齊；下面放不下改放上面；左右不超出視窗。手機寬度維持置中
function placeNear(anchor: HTMLElement, panel: HTMLElement): Position | null {
    if (window.innerWidth <= 600) return null;
    const a = anchor.getBoundingClientRect();
    const h = panel.offsetHeight;
    const w = panel.offsetWidth;
    const below = a.bottom + EDGE;
    const fitsBelow = below + h <= window.innerHeight - EDGE;
    const fitsAbove = a.top - EDGE - h >= EDGE;
    const above = !fitsBelow && fitsAbove;
    const top = fitsBelow ? below : above ? a.top - EDGE - h : Math.max(EDGE, window.innerHeight - EDGE - h);
    const left = Math.min(Math.max(a.left, EDGE), window.innerWidth - EDGE - w);
    return { top, left, above };
}

function Icon({ d, size = 20 }: { d: string; size?: number }) {
    return <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true"><path d={d}/></svg>;
}

// 一欄可以上下捲的數字（時或分）。顯示選中的值和上下各兩個，循環（23 的下一個是 00）
function TimeColumn({ unit, value, count, onChange }: { unit: string; value: number; count: number; onChange: (v: number) => void }) {
    const step = (delta: number) => onChange((value + delta + count) % count);
    const onKeyDown = (e: ReactKeyboardEvent) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        step(e.key === 'ArrowUp' ? -1 : 1);
    };
    const onWheel = (e: ReactWheelEvent) => { if (e.deltaY !== 0) step(e.deltaY > 0 ? 1 : -1); };
    return <div className="picker-column" role="group" aria-label={unit} onKeyDown={onKeyDown} onWheel={onWheel}>
        <span className="picker-unit" aria-hidden="true">{unit}</span>
        <button type="button" className="picker-chevron" aria-label={`上一個${unit}`} onClick={() => step(-1)}>
            <Icon size={18} d="M5.5 11.5L10 7l4.5 4.5"/>
        </button>
        <div className="picker-options">
            {[-2, -1, 0, 1, 2].map(offset => {
                const v = (value + offset + count) % count;
                return <button key={offset} type="button" className="picker-option" data-distance={Math.abs(offset)}
                    aria-pressed={offset === 0} aria-label={`${pad2(v)} ${unit}`} tabIndex={offset === 0 ? 0 : -1}
                    onClick={() => onChange(v)}>{pad2(v)}</button>;
            })}
        </div>
        <button type="button" className="picker-chevron" aria-label={`下一個${unit}`} onClick={() => step(1)}>
            <Icon size={18} d="M5.5 8.5L10 13l4.5-4.5"/>
        </button>
    </div>;
}

export function DateTimePicker({ label, value, minDate, defaultTime, anchor, onConfirm, onClose }: Props) {
    const [closing, close] = useClosing(onClose);
    const [step, setStep] = useState<'date' | 'time'>('date');
    const [date, setDate] = useState<string | null>(value ? value.slice(0, 10) : null);
    const initialTime = value ? formatTime(value) : defaultTime;
    const [hour, setHour] = useState(Number(initialTime.slice(0, 2)));
    const [minute, setMinute] = useState(Number(initialTime.slice(3, 5)));
    const start = value ?? `${minDate}T00:00`;
    const [month, setMonth] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 });
    const today = dateKey(new Date());
    const panel = useRef<HTMLElement>(null);
    const [position, setPosition] = useState<Position | null>(null);
    // 日期和時間兩個畫面高度不同，換步驟或視窗大小改變時重新算位置
    useLayoutEffect(() => {
        const update = () => { if (anchor.current && panel.current) setPosition(placeNear(anchor.current, panel.current)); };
        update();
        window.addEventListener('resize', update);
        return () => window.removeEventListener('resize', update);
    }, [step, anchor]);

    // 換步驟時把焦點放到新畫面的第一個重點：日期是選中的那天（沒有就今天），時間是「時」那欄
    useEffect(() => {
        const target = step === 'date'
            ? panel.current?.querySelector<HTMLElement>('[aria-pressed="true"].picker-day, .picker-day[data-today]:not(:disabled), .picker-day:not(:disabled)')
            : panel.current?.querySelector<HTMLElement>('.picker-option[aria-pressed="true"]');
        target?.focus();
    }, [step]);

    const first = new Date(month.y, month.m, 1);
    const weeks = Math.ceil((first.getDay() + new Date(month.y, month.m + 1, 0).getDate()) / 7);
    const days = Array.from({ length: weeks * 7 }, (_, i) => new Date(month.y, month.m, 1 - first.getDay() + i));
    const firstOfMonth = (y: number, m: number) => dateKey(new Date(y, m, 1));
    const canGoBack = firstOfMonth(month.y, month.m) > minDate.slice(0, 8) + '01';
    const shiftMonth = (delta: number) => setMonth(({ y, m }) => {
        const d = new Date(y, m + delta, 1);
        return { y: d.getFullYear(), m: d.getMonth() };
    });

    return <div className="picker-backdrop" data-closing={closing || undefined} data-anchored={position ? true : undefined}
        onPointerDown={e => { if (e.target === e.currentTarget) close(); }}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
        <section ref={panel} className="picker-panel" role="dialog" aria-modal="true" aria-label={`選擇${label}`}
            data-above={position?.above || undefined} style={position ? { top: position.top, left: position.left } : undefined}>
            {step === 'date' ? <>
                <header className="picker-month">
                    <button type="button" className="picker-icon-button" aria-label="上個月" disabled={!canGoBack} onClick={() => shiftMonth(-1)}>
                        <Icon d="M16 10H4M8.5 5.5L4 10l4.5 4.5"/>
                    </button>
                    <h2 aria-live="polite">{month.y}年{month.m + 1}月</h2>
                    <button type="button" className="picker-icon-button" aria-label="下個月" onClick={() => shiftMonth(1)}>
                        <Icon d="M4 10h12M11.5 5.5L16 10l-4.5 4.5"/>
                    </button>
                </header>
                <div className="picker-grid" aria-hidden="true">
                    {WEEKDAYS.map(w => <span key={w} className="picker-weekday">{w}</span>)}
                </div>
                <div className="picker-grid">
                    {days.map(d => {
                        const key = dateKey(d);
                        const outside = d.getMonth() !== month.m;
                        return <button key={key} type="button" className="picker-day" disabled={outside || key < minDate}
                            aria-pressed={key === date} data-today={key === today || undefined}
                            aria-label={`${d.getMonth() + 1}月${d.getDate()}日${key === today ? '（今天）' : ''}`}
                            onClick={() => { setDate(key); setStep('time'); }}>{d.getDate()}</button>;
                    })}
                </div>
            </> : <>
                <header className="picker-time-heading">
                    <button type="button" className="picker-icon-button" aria-label="回到選日期" onClick={() => setStep('date')}>
                        <Icon d="M16 10H4M8.5 5.5L4 10l4.5 4.5"/>
                    </button>
                    <h2>選擇時間</h2>
                    <button type="button" className="picker-icon-button" aria-label="關閉" onClick={close}>
                        <Icon d="M5 5l10 10M15 5L5 15"/>
                    </button>
                </header>
                <div className="picker-summary">
                    <div>
                        <span>活動{label}</span>
                        <small>{date && formatDate(date)}・24 小時制</small>
                    </div>
                    <strong aria-live="polite">{pad2(hour)}:{pad2(minute)}</strong>
                </div>
                <div className="picker-columns">
                    <TimeColumn unit="時" value={hour} count={24} onChange={setHour}/>
                    <span className="picker-colon" aria-hidden="true">:</span>
                    <TimeColumn unit="分" value={minute} count={60} onChange={setMinute}/>
                </div>
                <footer className="picker-actions">
                    <button type="button" className="picker-cancel" onClick={close}>取消</button>
                    <button type="button" className="picker-confirm"
                        onClick={() => { if (date) { onConfirm(`${date}T${pad2(hour)}:${pad2(minute)}`); close(); } }}>確認</button>
                </footer>
            </>}
        </section>
    </div>;
}
