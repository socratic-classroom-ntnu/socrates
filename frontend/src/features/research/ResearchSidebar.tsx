import { useEffect, useRef, useState } from 'react';
import { getPublicConfig } from '../../contract/classroomClient';
import '../../styles/research.css';
let loader;
let loadedCx = '';
/** One official Search Element script and one results container per browser document. */
export function prepareSearch(cx) {
    if (!/^[A-Za-z0-9:_-]{5,160}$/.test(cx))
        return Promise.reject(Error('SEARCH_ENGINE_ID_REQUIRED'));
    if (loader && loadedCx === cx)
        return loader;
    if (loadedCx && loadedCx !== cx)
        return Promise.reject(Error('SEARCH_ENGINE_REVISION_REFRESH'));
    loadedCx = cx;
    loader = new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => { loader = undefined; loadedCx = ''; reject(Error('SEARCH_PROVIDER_READBACK_PENDING')); }, 15000);
        const script = document.createElement('script');
        script.src = 'https://cse.google.com/cse.js?cx=' + encodeURIComponent(cx);
        script.async = true;
        const w = window;
        w.__gcse = { parsetags: 'explicit', callback: () => { window.clearTimeout(timeout); resolve(); } };
        script.onerror = () => { window.clearTimeout(timeout); script.remove(); loader = undefined; loadedCx = ''; reject(Error('SEARCH_PROVIDER_RETRY_READY')); };
        document.head.appendChild(script);
    });
    return loader;
}
export function ResearchSidebar({ sessionId, defaultOpen = true }) {
    const [open, setOpen] = useState(defaultOpen), [query, setQuery] = useState(''), [status, setStatus] = useState('搜尋設定讀取中'), [scope, setScope] = useState('');
    const host = useRef(null), handle = useRef(null), last = useRef('');
    const id = useRef('research-search-' + Math.random().toString(36).slice(2));
    useEffect(() => {
        let active = true;
        getPublicConfig().then(async (cfg) => {
            if (!active)
                return;
            setScope(cfg.search_scope);
            if (!cfg.google_cse_id) {
                setStatus('輸入關鍵字後，可選擇在 Google 開啟查詢。');
                return;
            }
            await prepareSearch(cfg.google_cse_id);
            if (!active || !host.current)
                return;
            const api = window.google?.search?.cse?.element;
            if (!api)
                throw Error('SEARCH_ELEMENT_READY_REQUIRED');
            api.render({ div: host.current.id, tag: 'searchresults-only', gname: id.current, attributes: { linkTarget: '_blank', enableHistory: false } });
            handle.current = api.getElement(id.current);
            setStatus('搜尋已準備完成');
            if (last.current)
                handle.current.execute(last.current);
        }).catch(() => { if (active)
            setStatus('搜尋服務正在恢復；查詢文字保留於本頁。'); });
        return () => { active = false; handle.current = null; };
    }, [sessionId]);
    function search() { const text = query.trim(); if (!text)
        return; last.current = text; if (handle.current) {
        handle.current.execute(text);
        setStatus('Google 搜尋結果');
    }
    else
        setStatus('查詢已保存；下方入口可開啟 Google。'); }
    return <aside className={'research-panel ' + (open ? 'is-open' : 'is-closed')} data-research-panel aria-label="查資料側欄">
 <button type="button" className="research-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '收合查資料 →' : '← 查資料'}</button>
 <div hidden={!open}><header><small>選用工具 · GOOGLE</small><h2>查資料</h2><p>自行輸入關鍵字；回到題目時保留查詢與作答。</p></header>
 <form onSubmit={e => { e.preventDefault(); e.stopPropagation(); search(); }}><label htmlFor={id.current + '-q'}>搜尋關鍵字</label><div className="search-field"><input id={id.current + '-q'} maxLength={200} value={query} onChange={e => setQuery(e.target.value)} placeholder="輸入想查證的內容"/><button type="submit" disabled={!query.trim()}>搜尋</button></div></form>
 <p role="status" className="search-status">{status}</p><small>{scope === 'entitled-full-web' ? '既有全網搜尋權益' : scope === 'sites' ? '已設定網站範圍' : ''}</small>
 <div id={id.current} ref={host} className="search-results"/>
 {query.trim() && <a href={'https://www.google.com/search?q=' + encodeURIComponent(query.trim())} target="_blank" rel="noopener noreferrer" className="search-external">在 Google 開啟此查詢 ↗</a>}
 <footer>Google 接收你送出的搜尋文字。引用資料時，請保留來源與上下文。</footer></div></aside>;
}
export function AnswerWithResearch({ sessionId, children, defaultOpen = true }) {
    return <div className="answer-layout"><div className="answer-content">{children}</div><ResearchSidebar key={sessionId} sessionId={sessionId} defaultOpen={defaultOpen}/></div>;
}
