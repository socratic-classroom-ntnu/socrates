// 換順序時的滑動動畫（FLIP）：換之前記下每個元素「畫面上實際的位置」，換完從那裡滑到新位置。
// 用畫面上的位置（含進行中的動畫）而不是排版位置，快速連續換位時動畫才會接得上、不會一跳一跳。
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

export function snapshotTops(elements: Map<string, HTMLElement>) {
    const tops = new Map<string, number>();
    elements.forEach((el, id) => tops.set(id, el.getBoundingClientRect().top));
    return tops;
}

// 先一次清掉所有舊動畫、一次量完新位置，再一次寫入，避免邊讀邊寫造成多次重新排版
export function playFlip(elements: Map<string, HTMLElement>, before: Map<string, number>, transition: string, skip?: string | null) {
    if (reducedMotion()) return;
    const moving = [...elements].filter(([id]) => id !== skip && before.has(id));
    moving.forEach(([, el]) => { el.style.transition = 'none'; el.style.transform = ''; });
    const deltas = moving.map(([id, el]) => [el, before.get(id)! - el.getBoundingClientRect().top] as const);
    deltas.forEach(([el, delta]) => { if (delta) el.style.transform = `translateY(${delta}px)`; });
    void document.body.offsetHeight; // 讓起點先生效，下面的 transition 才會從舊位置開始滑
    deltas.forEach(([el, delta]) => {
        if (!delta) return;
        el.style.transition = transition;
        el.style.transform = '';
    });
}
