import React, { useEffect, useState } from 'react';

// 個人對話：學生作答後先與導師各自釐清立場，確認的基準才進入多人討論。
// 每個按鈕只依後端給的 available_actions（老師端為每列的 actions）顯示，不由狀態或階段推導。

export type PersonalSummary = {
    current_position: string;
    reason_summary: string;
    relevant_conditions: string[];
    unresolved_issue: string;
};
export type PersonalView = {
    status: string;
    generating: boolean;
    messages: { role: string; text: string }[];
    completed_turns: number;
    max_turns: number;
    summary: PersonalSummary | null;
    summary_digest: string | null;
    baseline: { position: string; reason_summary: string; conditions: string[] } | null;
    notice: string | null;
    open: boolean;
};
export type SendCommand = (kind: string, data?: Record<string, unknown>) => Promise<boolean>;

export const PERSONAL_STATUS_TEXT: Record<string, string> = {
    probing: '對話中',
    awaiting_confirm: '待確認',
    confirmed: '已確認基準',
    unclear: '暫時無法釐清',
    capped: '尚未釐清',
    incomplete: '未完成',
    unavailable: '導師暫停',
};

const OUTCOME_TEXT: Record<string, string> = {
    confirmed: '你已確認這份摘要，它會作為你在本題的基準立場。請等待其他同學與老師進入多人討論。',
    unclear: '你選擇了「暫時無法釐清」。這一題保留你的對話紀錄，但不會作為多人討論的基準。',
    capped: '本題尚未釐清：已達回覆上限。下方是暫存摘要，不會作為你的基準立場。',
    incomplete: '個人對話已結束，本題尚未完成。對話紀錄已保存。',
};

function SummaryCard({ summary }: { summary: PersonalSummary }) {
    return <dl className="personal-summary">
    <dt>立場</dt><dd>{summary.current_position}</dd>
    <dt>理由</dt><dd>{summary.reason_summary}</dd>
    <dt>條件</dt><dd>{summary.relevant_conditions.length ? <ul>{summary.relevant_conditions.map((c, i) => <li key={i}>{c}</li>)}</ul> : '（沒有提到特別的條件）'}</dd>
  </dl>;
}

export function PersonalPanel({ question, personal, actions, send, busy = false, note = '' }: {
    question: { title?: string; scenario?: string } | null;
    personal: PersonalView;
    actions: string[];
    send: SendCommand;
    busy?: boolean;
    note?: string;
}) {
    const [text, setText] = useState(''), [revision, setRevision] = useState(''), [revising, setRevising] = useState(false);
    const can = (kind: string) => actions.includes(kind);
    useEffect(() => { setRevising(false); setRevision(''); }, [personal.summary_digest]);
    async function reply() {
        if (text.trim() && await send('personal_message', { text }))
            setText('');
    }
    async function revise() {
        if (revision.trim() && await send('personal_revise', { text: revision })) {
            setRevision('');
            setRevising(false);
        }
    }
    return <section className="r2-answer personal-dialogue" aria-label="個人對話">
    <div className="r2-prompt"><small>你的個人對話 · {PERSONAL_STATUS_TEXT[personal.status] || personal.status}</small><h1>{question?.title}</h1><p>{question?.scenario}</p></div>
    <div className="personal-thread">{personal.messages.map((m, i) => <article className={'r2-message ' + m.role} key={i}><small>{m.role === 'tutor' ? '導師' : '你'}</small><p>{m.text}</p></article>)}
      {personal.generating && <p role="status" className="personal-generating"><span className="r2-pulse"/>導師正在思考下一個問題…</p>}
    </div>
    {personal.status === 'unavailable' && personal.notice && <p role="status" className="personal-notice">{personal.notice}</p>}
    {can('personal_retry') && <button onClick={() => void send('personal_retry')} disabled={busy}>重試</button>}
    {can('personal_message') && <div className="personal-compose"><label>回覆導師<textarea rows={3} maxLength={12000} value={text} onChange={e => setText(e.target.value)} placeholder="說說你現在的想法…" onKeyDown={e => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void reply();
        } }}/></label><button disabled={busy || !text.trim()} onClick={() => void reply()}>送出</button><small>已回覆 {personal.completed_turns} / {personal.max_turns} 次</small></div>}
    {can('personal_confirm') && personal.summary && <div className="r2-card personal-confirm" role="group" aria-label="確認你的立場摘要"><h2>這是導師整理的你目前的想法</h2><SummaryCard summary={personal.summary}/>
      <div className="r2-row"><button disabled={busy} onClick={() => void send('personal_confirm', { summary_digest: personal.summary_digest })}>符合我的想法</button>
        {can('personal_revise') && <button className="quiet" disabled={busy} aria-expanded={revising} onClick={() => setRevising(!revising)}>我要修正</button>}
        {can('personal_unclear') && <button className="quiet" disabled={busy} onClick={() => void send('personal_unclear')}>暫時無法釐清</button>}</div>
      {revising && can('personal_revise') && <div className="personal-compose"><label>哪裡不符合？請寫下你的修正<textarea rows={3} maxLength={12000} value={revision} onChange={e => setRevision(e.target.value)}/></label><button disabled={busy || !revision.trim()} onClick={() => void revise()}>送出修正</button></div>}
    </div>}
    {OUTCOME_TEXT[personal.status] && <div className="r2-card personal-outcome"><p role="status">{OUTCOME_TEXT[personal.status]}</p>{personal.status === 'confirmed' && personal.baseline && <SummaryCard summary={{ current_position: personal.baseline.position, reason_summary: personal.baseline.reason_summary, relevant_conditions: personal.baseline.conditions, unresolved_issue: '' }}/>}{personal.status === 'capped' && personal.summary && <SummaryCard summary={personal.summary}/>}</div>}
    {note && <p role="status">{note}</p>}
  </section>;
}

export type PersonalOverviewRow = {
    member_id: string;
    alias: string;
    status: string;
    generating: boolean;
    completed_turns: number;
    summary: PersonalSummary | null;
    baseline: { position: string; reason_summary: string } | null;
    actions: string[];
};
const COUNT_ORDER = ['probing', 'awaiting_confirm', 'confirmed', 'unclear', 'capped', 'incomplete', 'unavailable'];

/** 一行個人對話進度：老師的組別卡片與組內面板共用。 */
export function PersonalCounts({ progress }: { progress: Record<string, number> | null | undefined }) {
    if (!progress)
        return null;
    return <p className="personal-counts">{COUNT_ORDER.filter(k => progress[k]).map(k => `${PERSONAL_STATUS_TEXT[k]} ${progress[k]}`).join(' · ') || '尚無個人對話'}{progress.not_answered ? ` · 未作答 ${progress.not_answered}` : ''}</p>;
}

/** 老師端：各狀態人數與每位學生的摘要／基準；不含私人對話原文。 */
export function PersonalProgress({ progress, overview, send, busy = false }: {
    progress: Record<string, number> | null;
    overview: PersonalOverviewRow[] | null;
    send: SendCommand;
    busy?: boolean;
}) {
    if (!progress)
        return null;
    return <section className="personal-progress" aria-label="個人對話進度"><h3>本題個人對話</h3><PersonalCounts progress={progress}/>
    {!!overview?.length && <ul>{overview.map(row => <li key={row.member_id}><strong>{row.alias}</strong> · {PERSONAL_STATUS_TEXT[row.status] || row.status}{row.generating ? '（導師生成中）' : ''}
        {row.baseline ? <p>基準：{row.baseline.position}；{row.baseline.reason_summary}</p> : row.summary ? <p>暫存摘要：{row.summary.current_position}；{row.summary.reason_summary}</p> : null}
        {row.actions.includes('personal_retry') && <button disabled={busy} onClick={() => void send('personal_retry', { member_id: row.member_id })}>重試導師</button>}</li>)}</ul>}
  </section>;
}
