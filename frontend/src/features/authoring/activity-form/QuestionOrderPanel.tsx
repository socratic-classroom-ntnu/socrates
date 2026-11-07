// 「變更題目順序」按下去之後的面板。對應 Figma「題目順序彈出面板」。
// 拖曳題目列調整順序（滑鼠、觸控都可以）；鍵盤可以用上下鍵移動目前選中的題目。改動會即時套用到表單。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { playFlip, snapshotTops } from './flip';
import { useClosing } from './usePresence';

type Item = { id: string; title: string };
type Props = { items: Item[]; onReorder: (ids: string[]) => void; onClose: () => void };

const SLIDE = 'transform 180ms cubic-bezier(.2,.8,.2,1)';

function move(ids: string[], from: number, to: number) {
    const next = [...ids];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    return next;
}

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function Grip({ small }: { small?: boolean }) {
    return <svg className={small ? 'order-grip order-grip-small' : 'order-grip'} viewBox="0 0 16 20" aria-hidden="true">
        <path d="M6 4v1M10 4v1M6 9.5v1M10 9.5v1M6 15v1M10 15v1"/>
    </svg>;
}

// 拖曳中：指標抓在題目列的哪個高度，以及這列現在要畫在清單裡的哪個位置
type Drag = { id: string; grabOffset: number; top: number };

export function QuestionOrderPanel({ items, onReorder, onClose }: Props) {
    const [closing, close] = useClosing(onClose);
    const [selected, setSelected] = useState<string | null>(null);
    const [draggingId, setDraggingId] = useState<string | null>(null);
    const drag = useRef<Drag | null>(null);
    const list = useRef<HTMLOListElement>(null);
    const rows = useRef(new Map<string, HTMLButtonElement>());
    const before = useRef<Map<string, number> | null>(null);
    const ids = items.map(i => i.id);
    const orderKey = ids.join('|');

    // 打開時把焦點放在第一題，它會成為選中的那列（跟設計稿一樣）
    const firstId = useRef(ids[0]);
    useEffect(() => { rows.current.get(firstId.current)?.focus(); }, []);

    // 換位置：先記下目前畫面上的位置，再請外面換順序（表單也會即時跟著換）
    const reorder = (next: string[]) => {
        before.current = snapshotTops(rows.current);
        onReorder(next);
    };
    // 順序一變，其他題目從剛才的位置滑到新位置；被拖曳的那列繼續黏在指標下
    useLayoutEffect(() => {
        if (before.current) playFlip(rows.current, before.current, SLIDE, drag.current?.id);
        before.current = null;
        const d = drag.current;
        const el = d && rows.current.get(d.id);
        if (d && el) el.style.transform = `translateY(${d.top - el.offsetTop}px)`;
    }, [orderKey]);

    const pointerY = (clientY: number) => {
        const box = list.current!.getBoundingClientRect();
        return clientY - box.top + list.current!.scrollTop;
    };
    const onPointerDown = (e: ReactPointerEvent<HTMLButtonElement>, id: string) => {
        if (e.button !== 0) return;
        const el = e.currentTarget;
        el.setPointerCapture?.(e.pointerId);
        el.style.transition = 'none';
        drag.current = { id, grabOffset: pointerY(e.clientY) - el.offsetTop, top: el.offsetTop };
        setSelected(id);
        setDraggingId(id);
    };
    const onPointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
        const d = drag.current;
        if (!d) return;
        const el = e.currentTarget;
        const maxTop = list.current!.scrollHeight - el.offsetHeight;
        d.top = Math.min(Math.max(pointerY(e.clientY) - d.grabOffset, 0), maxTop);
        el.style.transform = `translateY(${d.top - el.offsetTop}px)`;
        // 被拖的那列中心越過其他題目的中線，就跟它換位置（用排版位置判斷，不受動畫影響）
        const center = d.top + el.offsetHeight / 2;
        const target = ids.filter(id => id !== d.id).filter(id => {
            const r = rows.current.get(id)!;
            return r.offsetTop + r.offsetHeight / 2 < center;
        }).length;
        const from = ids.indexOf(d.id);
        if (target !== from) reorder(move(ids, from, target));
    };
    const endDrag = (e: ReactPointerEvent<HTMLButtonElement>) => {
        if (!drag.current) return;
        drag.current = null;
        setDraggingId(null);
        // 放開後滑回自己的格子
        const el = e.currentTarget;
        el.style.transition = reducedMotion() ? 'none' : SLIDE;
        el.style.transform = '';
    };
    const onKeyDown = (e: ReactKeyboardEvent, id: string) => {
        const from = ids.indexOf(id);
        const to = e.key === 'ArrowUp' ? from - 1 : e.key === 'ArrowDown' ? from + 1 : -1;
        if (to < 0 || to >= ids.length) return;
        e.preventDefault();
        reorder(move(ids, from, to));
    };

    return <div className="order-backdrop" data-closing={closing || undefined}
        onPointerDown={e => { if (e.target === e.currentTarget) close(); }}
        onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}>
        <section className="order-panel" role="dialog" aria-modal="true" aria-labelledby="order-panel-title">
            <header className="order-heading">
                <h2 id="order-panel-title">題目順序</h2>
                <button type="button" className="order-close" aria-label="關閉題目順序" onClick={close}>
                    <svg viewBox="0 0 18 18" aria-hidden="true"><path d="M4.5 4.5l9 9M13.5 4.5l-9 9"/></svg>
                </button>
            </header>
            <p className="order-hint" id="order-panel-hint"><Grip small/>拖曳題目以調整順序</p>
            <ol className="order-list" ref={list} aria-describedby="order-panel-hint">
                {items.map((item, i) => <li key={item.id}>
                    <button type="button" className="order-row" aria-current={selected === item.id ? 'true' : undefined}
                        data-dragging={draggingId === item.id || undefined}
                        aria-label={`第 ${i + 1} 題：${item.title || '未命名題目'}，按上下鍵調整順序`}
                        ref={el => { if (el) rows.current.set(item.id, el); else rows.current.delete(item.id); }}
                        onFocus={() => setSelected(item.id)} onKeyDown={e => onKeyDown(e, item.id)}
                        onPointerDown={e => onPointerDown(e, item.id)} onPointerMove={onPointerMove}
                        onPointerUp={endDrag} onPointerCancel={endDrag}>
                        <Grip/>
                        <span className="order-number">{i + 1}</span>
                        <span className={item.title ? 'order-title' : 'order-title order-untitled'}>{item.title || '未命名題目'}</span>
                        {selected === item.id && <svg className="order-check" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 9.5l4 4 8-9"/></svg>}
                    </button>
                </li>)}
            </ol>
        </section>
    </div>;
}
