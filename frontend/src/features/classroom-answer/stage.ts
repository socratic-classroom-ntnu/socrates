import { MutableRefObject, RefObject, useEffect, useLayoutEffect, useState } from 'react';

// 設計稿畫布（Figma「3 問題作答」「4 選定並寫下想法」都是 1280×800）
export const STAGE_W = 1280;
export const STAGE_H = 800;

// 設計稿內容的外框：左上 Progress（16,14）到右下筆記紙（1232,778）。
// 桌機放大填滿螢幕時可以裁掉背景邊緣，但這塊不能被裁掉。
const SAFE = { left: 16, top: 14, right: 1232, bottom: 778 };

// 組長規範的 900px 斷點：以下改成直向排列，不再縮放整張畫布
export const MOBILE_QUERY = '(max-width: 900px)';

export function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.matchMedia?.(MOBILE_QUERY).matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.(MOBILE_QUERY);
    if (!query) return;
    const onChange = () => setMobile(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return mobile;
}

export function useStageScale(canvas: RefObject<HTMLElement>, mobile: boolean) {
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el) return;
    if (mobile) {
      el.style.transform = '';
      return;
    }
    function fit() {
      if (!el) return;
      const w = window.innerWidth, h = window.innerHeight;
      const cover = Math.max(w / STAGE_W, h / STAGE_H);
      const keepX = w / (2 * Math.max(STAGE_W / 2 - SAFE.left, SAFE.right - STAGE_W / 2));
      const keepY = h / (2 * Math.max(STAGE_H / 2 - SAFE.top, SAFE.bottom - STAGE_H / 2));
      el.style.transform = `translate(-50%, -50%) scale(${Math.min(cover, keepX, keepY)})`;
    }
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [canvas, mobile]);
}

// 題目太長時縮小字體塞進黑板（794×200），不截掉文字；手機版交給 CSS 的 clamp()。
// 黑板的楷書是網路字型，載入完字會變寬，所以字型載完要再量一次。
const MAX_FONT = 40, MIN_FONT = 16;
export function useFitText(box: RefObject<HTMLElement>, label: RefObject<HTMLElement>, text: RefObject<HTMLElement>, content: string, mobile: boolean) {
  useLayoutEffect(() => {
    function fit() {
      const container = box.current, el = text.current;
      if (!container || !el) return;
      el.style.fontSize = '';
      if (mobile) return;
      const style = getComputedStyle(container);
      const available = container.clientHeight
        - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)
        - (label.current?.offsetHeight ?? 0) - parseFloat(style.rowGap || '0');
      let size = MAX_FONT;
      el.style.fontSize = `${size}px`;
      while (el.offsetHeight > available && size > MIN_FONT) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
    }
    return refitOnFontLoad(fit);
  }, [box, label, text, content, mobile]);
}

// 卡片上的選項文字：先縮小字體留在一行，縮到下限還放不下才換行（wrap=false 時改用省略號，給 46px 高的小卡用）
export function useFitOneLine(text: RefObject<HTMLElement>, content: string, max: number, min: number, wrap = true) {
  useLayoutEffect(() => {
    function fit() {
      const el = text.current;
      if (!el) return;
      el.style.whiteSpace = 'nowrap';
      let size = max;
      el.style.fontSize = `${size}px`;
      while (el.scrollWidth > el.clientWidth && size > min) {
        size -= 1;
        el.style.fontSize = `${size}px`;
      }
      if (wrap && el.scrollWidth > el.clientWidth) el.style.whiteSpace = '';
    }
    return refitOnFontLoad(fit);
  }, [text, content, max, min, wrap]);
}

// 量一次，網路字型載完、視窗大小改變（手機版卡片寬度會變）時再量一次
function refitOnFontLoad(fit: () => void) {
  fit();
  let cancelled = false;
  document.fonts?.ready.then(() => { if (!cancelled) fit(); });
  document.fonts?.addEventListener?.('loadingdone', fit);
  window.addEventListener('resize', fit);
  return () => {
    cancelled = true;
    document.fonts?.removeEventListener?.('loadingdone', fit);
    window.removeEventListener('resize', fit);
  };
}

// 伺服器同步的倒數：deadline 是伺服器時間（秒），offset 是本機與伺服器的時差（毫秒）
export function useCountdown(deadline: number | null | undefined, offset: MutableRefObject<number>) {
  const remaining = () => (deadline ? Math.max(0, Math.ceil(deadline - (Date.now() + offset.current) / 1000)) : 0);
  const [seconds, setSeconds] = useState(remaining);
  useEffect(() => {
    setSeconds(remaining());
    if (!deadline) return;
    const id = window.setInterval(() => setSeconds(remaining()), 250);
    return () => clearInterval(id);
  }, [deadline, offset]); // remaining 只依賴 deadline 與 offset
  return seconds;
}
