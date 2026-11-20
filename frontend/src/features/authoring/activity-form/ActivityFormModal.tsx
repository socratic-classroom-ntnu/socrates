// 教師出題表單（Issue #26）。對應 Figma「教師端・新增活動開啟」的 Create activity panel。
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { DateTimePicker, formatDate, formatTime } from './DateTimePicker';
import { playFlip, snapshotTops } from './flip';
import { QuestionOrderPanel } from './QuestionOrderPanel';
import './activity-form.css';

// 按「確認」後交給外面頁面的資料。「其他」選項不放進來，後端會自己補上
export type ActivityDraft = {
    name: string; startAt: string; endAt: string; topic: string; expectedAnalysis: string;
    questions: { title: string; content: string; answerType: AnswerType; options: string[]; wordLimit: number }[];
};
type Props = {
    onClose: () => void;
    onSubmit: (draft: ActivityDraft) => void;
    // AI 出題（#16）還沒有後端；沒傳的時候按鈕只顯示「尚未開放」
    onAiAssist?: () => void;
};

function FieldError({ id, message }: { id: string; message?: string }) {
    return message ? <p className="activity-form-error" id={id}>{message}</p> : null;
}

// 開始／結束時間：點下去打開日期與時間選擇器，選好後顯示「2026年10月9日 | 14:20」
type ScheduleProps = {
    label: string; value: string | null; error?: string; minDate: string; defaultTime: string;
    onChange: (value: string) => void;
};
function ScheduleField({ label, value, error, minDate, defaultTime, onChange }: ScheduleProps) {
    const id = useId();
    const [open, setOpen] = useState(false);
    const trigger = useRef<HTMLButtonElement>(null);
    return <div className="activity-form-field">
        <span className="activity-form-label" id={id}>* {label}</span>
        <button ref={trigger} type="button" className="activity-form-input activity-form-picker" aria-labelledby={id}
            aria-haspopup="dialog" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined}
            onClick={() => setOpen(true)}>
            {value
                ? <><span>{formatDate(value)}</span><span className="activity-form-picker-divider" aria-hidden="true"/><span>{formatTime(value)}</span></>
                : <span className="activity-form-placeholder">日期/時間</span>}
        </button>
        <FieldError id={`${id}-error`} message={error}/>
        {open && <DateTimePicker label={label} value={value} minDate={minDate} defaultTime={defaultTime} anchor={trigger} onConfirm={onChange}
            onClose={() => { setOpen(false); trigger.current?.focus({ preventScroll: true }); }}/>}
    </div>;
}

type AnswerType = 'choice' | 'short';
type ChoiceOption = { id: string; text: string };
type Question = {
    id: string; title: string; content: string; answerType: AnswerType | null;
    options: ChoiceOption[]; wordLimit: string;
};
// 只在這個表單裡當 React key 用的 id。不用 crypto.randomUUID：它在非 https 的網址（例如用區網 IP 開）不存在。
// 加上亂數是因為開發時熱更新會讓 lastId 歸零，只靠編號會跟畫面上還留著的題目撞號，兩題就會連動
let lastId = 0;
const localId = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 8)}-${++lastId}`;
const newOption = (): ChoiceOption => ({ id: localId('option'), text: '' });
const newQuestion = (): Question => ({
    id: localId('question'), title: '', content: '', answerType: null,
    options: [newOption(), newOption(), newOption()], wordLimit: '',
});
type QuestionErrors = { title?: string; answerType?: string; options?: string; wordLimit?: string };
function validateQuestion(q: Question): QuestionErrors {
    const errors: QuestionErrors = {};
    if (!q.title.trim()) errors.title = '請輸入問題';
    if (q.answerType === null) errors.answerType = '請選擇答案類型';
    if (q.answerType === 'choice' && q.options.some(o => !o.text.trim())) errors.options = '請填寫所有選項，用不到的可以按 ✕ 刪除';
    if (q.answerType !== null && !/^[1-9]\d*$/.test(q.wordLimit.trim())) errors.wordLimit = '請輸入大於 0 的整數';
    return errors;
}
const ANSWER_TYPES: { value: AnswerType; label: string }[] = [
    { value: 'choice', label: '選擇題（選項＋理由）' },
    { value: 'short', label: '簡答題（開放回答）' },
];
// 老師自己寫的選項 2～4 個；後端會在最後自動補上「其他」，所以這裡固定顯示、不能改
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 4;

function ChoiceOptions({ options, error, onChange }: { options: ChoiceOption[]; error?: string; onChange: (options: ChoiceOption[]) => void }) {
    const errorId = useId();
    const inputs = useRef(new Map<string, HTMLInputElement>());
    const focusNext = useRef<string | null>(null);
    useEffect(() => {
        if (focusNext.current) inputs.current.get(focusNext.current)?.focus();
        focusNext.current = null;
    }, [options.length]);
    const add = () => {
        const option = newOption();
        focusNext.current = option.id;
        onChange([...options, option]);
    };
    return <div className="activity-form-options">
        {options.map((o, i) => <div className="activity-form-option" key={o.id}>
            <span className="activity-form-option-number" aria-hidden="true">{i + 1}</span>
            <div className="activity-form-option-box">
                <input className="activity-form-input" aria-label={`選項 ${i + 1}`} placeholder={`選項${i + 1}描述`} value={o.text}
                    aria-invalid={error && !o.text.trim() ? true : undefined} aria-describedby={error ? errorId : undefined}
                    ref={el => { if (el) inputs.current.set(o.id, el); else inputs.current.delete(o.id); }}
                    onChange={e => onChange(options.map(x => x.id === o.id ? { ...x, text: e.target.value } : x))}/>
                {options.length > MIN_OPTIONS && <button type="button" className="activity-form-option-remove" aria-label={`刪除選項 ${i + 1}`}
                    onClick={() => onChange(options.filter(x => x.id !== o.id))}>
                    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8"/></svg>
                </button>}
            </div>
        </div>)}
        <div className="activity-form-option">
            <span className="activity-form-option-number" aria-hidden="true">{options.length + 1}</span>
            <div className="activity-form-input activity-form-option-fixed">其他</div>
        </div>
        <button type="button" className="activity-form-button activity-form-add-option" disabled={options.length >= MAX_OPTIONS} onClick={add}>
            增加選項+(最多四個)
        </button>
        <FieldError id={errorId} message={error}/>
    </div>;
}

// 一題的編輯卡。「+新增題目」之後會出現多張
type EditorProps = {
    question: Question; number: number; total: number; errors: QuestionErrors;
    onChange: (patch: Partial<Question>) => void; onRemove: () => void;
};

function QuestionEditor({ question, number, total, errors, onChange, onRemove }: EditorProps) {
    const id = useId();
    return <div className="activity-form-question" role="group" aria-label={`第 ${number} 題`}>
        {/* 只有一題時照設計稿不顯示題號；兩題以上才顯示「第 N 題」和刪除 */}
        {total > 1 && <div className="activity-form-question-head">
            <span>第 {number} 題</span>
            <button type="button" className="activity-form-option-remove" aria-label={`刪除第 ${number} 題`} onClick={onRemove}>
                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 6l8 8M14 6l-8 8"/></svg>
            </button>
        </div>}
        <div className="activity-form-field">
            {/* 學生在黑板上看到的那一句問題（設計稿寫「標題」） */}
            <label className="activity-form-label" htmlFor={`${id}-title`}>* 問題</label>
            <input id={`${id}-title`} className="activity-form-input" placeholder="電車難題：你會拉拉桿嗎？" required
                aria-invalid={errors.title ? true : undefined} aria-describedby={errors.title ? `${id}-title-error` : undefined}
                value={question.title} onChange={e => onChange({ title: e.target.value })}/>
            <FieldError id={`${id}-title-error`} message={errors.title}/>
        </div>
        <div className="activity-form-field">
            {/* 題目的背景情境，學生作答時按「閱讀情境」會看到；對應後端題目的 scenario（設計稿寫「題目內容」） */}
            <label className="activity-form-label" htmlFor={`${id}-content`}>情境說明</label>
            <textarea id={`${id}-content`} className="activity-form-input activity-form-content" placeholder="今天有一輛列車.........."
                value={question.content} onChange={e => onChange({ content: e.target.value })}/>
        </div>
        {/* 答案類型是必填，所以直接顯示兩段切換（設計稿「尚未選擇答題類型」），不用先按「答案類型⌄」 */}
        <div className="activity-form-answer-type">
            <div className="activity-form-answer-row">
                <span className="activity-form-label" id={`${id}-type`}>* 答案類型</span>
                <div className="activity-form-segmented" role="radiogroup" aria-labelledby={`${id}-type`}
                    aria-invalid={errors.answerType ? true : undefined} aria-describedby={question.answerType === null ? `${id}-type-hint` : undefined}>
                    {ANSWER_TYPES.map(t => <button key={t.value} type="button" role="radio"
                        aria-checked={question.answerType === t.value} onClick={() => onChange({ answerType: t.value })}>{t.label}</button>)}
                </div>
            </div>
            {question.answerType === null && <p className={errors.answerType ? 'activity-form-helper activity-form-error' : 'activity-form-helper'}
                id={`${id}-type-hint`}>尚未選擇答題類型，請先選擇「選擇題」或「簡答題」。</p>}
        </div>
        {question.answerType === 'choice' && <ChoiceOptions options={question.options} error={errors.options} onChange={options => onChange({ options })}/>}
        {/* 選擇題（理由）和簡答題都要限制字數；切換類型時保留老師填的數字與選項 */}
        {question.answerType !== null && <div className="activity-form-field">
            <div className="activity-form-limit">
                <label className="activity-form-label" htmlFor={`${id}-limit`}>* 開放式答案字數限制</label>
                <input id={`${id}-limit`} className="activity-form-input" type="number" inputMode="numeric" min={1} required
                    aria-invalid={errors.wordLimit ? true : undefined} aria-describedby={errors.wordLimit ? `${id}-limit-error` : undefined}
                    placeholder="「字數」" value={question.wordLimit} onChange={e => onChange({ wordLimit: e.target.value })}/>
            </div>
            <FieldError id={`${id}-limit-error`} message={errors.wordLimit}/>
        </div>}
    </div>;
}

export function ActivityFormModal({ onClose, onSubmit, onAiAssist }: Props) {
    const closeButton = useRef<HTMLButtonElement>(null);
    const nameId = useId();
    const [name, setName] = useState('');
    const [topic, setTopic] = useState('');
    const [expectedAnalysis, setExpectedAnalysis] = useState('');
    const [startAt, setStartAt] = useState<string | null>(null);
    const [endAt, setEndAt] = useState<string | null>(null);
    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    // 結束時間預設停在開始時間的一小時後
    const endDefault = startAt ? `${String(Math.min(Number(startAt.slice(11, 13)) + 1, 23)).padStart(2, '0')}:${startAt.slice(14, 16)}` : '10:00';
    const [questions, setQuestions] = useState<Question[]>(() => [newQuestion()]);
    const [aiNotice, setAiNotice] = useState(false);

    // 按過一次「確認」才開始顯示錯誤，之後邊改邊更新
    const [submitted, setSubmitted] = useState(false);
    const [submitCount, setSubmitCount] = useState(0);
    const formErrors = {
        name: name.trim() ? undefined : '請輸入活動名稱',
        startAt: startAt ? undefined : '請選擇開始時間',
        endAt: !endAt ? '請選擇結束時間' : startAt && endAt <= startAt ? '結束時間要晚於開始時間' : undefined,
    };
    const questionErrors = new Map(questions.map(q => [q.id, validateQuestion(q)]));
    const hasErrors = Object.values(formErrors).some(Boolean)
        || [...questionErrors.values()].some(e => Object.keys(e).length > 0);
    const panel = useRef<HTMLElement>(null);
    // 送出失敗時，捲到第一個有問題的欄位並把游標放上去
    useEffect(() => {
        if (submitCount === 0) return;
        const first = panel.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
        first?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
        first?.focus({ preventScroll: true });
    }, [submitCount]);
    const confirm = () => {
        setSubmitted(true);
        if (hasErrors || !startAt || !endAt) { setSubmitCount(c => c + 1); return; }
        onSubmit({
            name: name.trim(), startAt, endAt, topic: topic.trim(), expectedAnalysis: expectedAnalysis.trim(),
            questions: questions.map(q => ({
                title: q.title.trim(), content: q.content.trim(), answerType: q.answerType!,
                options: q.answerType === 'choice' ? q.options.map(o => o.text.trim()) : [],
                wordLimit: Number(q.wordLimit),
            })),
        });
    };
    const shown = <T,>(error: T) => submitted ? error : undefined;
    const editQuestion = (qid: string, patch: Partial<Question>) =>
        setQuestions(qs => qs.map(q => q.id === qid ? { ...q, ...patch } : q));
    // 新增題目後捲到新的題目卡，游標放在它的標題
    const questionCards = useRef(new Map<string, HTMLDivElement>());
    const focusQuestion = useRef<string | null>(null);
    useEffect(() => {
        const card = focusQuestion.current && questionCards.current.get(focusQuestion.current);
        focusQuestion.current = null;
        if (!card) return;
        card.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
        card.querySelector('input')?.focus({ preventScroll: true });
    }, [questions.length]);
    const removeQuestion = (qid: string) => setQuestions(qs => qs.length > 1 ? qs.filter(q => q.id !== qid) : qs);
    const [orderOpen, setOrderOpen] = useState(false);
    const cardTops = useRef<Map<string, number> | null>(null);
    const orderButton = useRef<HTMLButtonElement>(null);
    const reorderQuestions = (ids: string[]) => {
        // 換順序前先記下每張卡片現在的位置，換完再從這裡滑過去
        cardTops.current = snapshotTops(questionCards.current);
        setQuestions(qs => ids.map(qid => qs.find(q => q.id === qid)).filter((q): q is Question => q !== undefined));
    };
    const closeOrder = () => { setOrderOpen(false); orderButton.current?.focus({ preventScroll: true }); };
    // 題目順序改變時，表單裡的題目卡從舊位置滑到新位置（在順序面板後面就看得到）
    const orderKey = questions.map(q => q.id).join('|');
    useLayoutEffect(() => {
        if (cardTops.current) playFlip(questionCards.current, cardTops.current, 'transform 240ms cubic-bezier(.2,.8,.2,1)');
        cardTops.current = null;
    }, [orderKey]);
    const addQuestion = () => {
        const question = newQuestion();
        focusQuestion.current = question.id;
        setQuestions(qs => [...qs, question]);
    };
    useEffect(() => {
        closeButton.current?.focus();
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        document.addEventListener('keydown', onKey);
        return () => document.removeEventListener('keydown', onKey);
    }, [onClose]);
    return <div className="activity-form-backdrop">
        <section ref={panel} className="activity-form" role="dialog" aria-modal="true" aria-labelledby="activity-form-title">
            <header className="activity-form-heading">
                <h2 id="activity-form-title">新增活動</h2>
                <button ref={closeButton} type="button" className="activity-form-close" aria-label="關閉" onClick={onClose}>
                    <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg>
                </button>
            </header>
            <div className="activity-form-body">
                <section className="activity-form-section" aria-labelledby={`${nameId}-basic`}>
                    <div className="activity-form-section-head"><h3 id={`${nameId}-basic`}>基礎資訊</h3></div>
                    <div className="activity-form-field">
                        <label className="activity-form-label" htmlFor={nameId}>* 活動名稱</label>
                        <input id={nameId} className="activity-form-input" required placeholder="活動名稱（電車難題）"
                            aria-invalid={shown(formErrors.name) ? true : undefined}
                            aria-describedby={shown(formErrors.name) ? `${nameId}-error` : undefined}
                            value={name} onChange={e => setName(e.target.value)}/>
                        <FieldError id={`${nameId}-error`} message={shown(formErrors.name)}/>
                    </div>
                    <div className="activity-form-schedule">
                        <ScheduleField label="開始時間" value={startAt} error={shown(formErrors.startAt)}
                            minDate={todayKey} defaultTime="09:00" onChange={setStartAt}/>
                        <ScheduleField label="結束時間" value={endAt} error={shown(formErrors.endAt)}
                            minDate={startAt ? startAt.slice(0, 10) : todayKey} defaultTime={endDefault} onChange={setEndAt}/>
                    </div>
                </section>
                <hr className="activity-form-divider"/>
                <section className="activity-form-section" aria-labelledby={`${nameId}-ai`}>
                    <div className="activity-form-section-head"><h3 id={`${nameId}-ai`}>給 AI 的內容</h3></div>
                    <div className="activity-form-field">
                        <label className="activity-form-label" htmlFor={`${nameId}-topic`}>主題方向</label>
                        <textarea id={`${nameId}-topic`} className="activity-form-input activity-form-topic"
                            placeholder={'輸入這個活動想讓學生瞭解的大方向\n\n例如：從電車難題出發，協助學生探討他們是如何衡量生命的價值'}
                            value={topic} onChange={e => setTopic(e.target.value)}/>
                    </div>
                    <div className="activity-form-field">
                        <label className="activity-form-label" htmlFor={`${nameId}-analysis`}>預期 AI 給出的分析</label>
                        <textarea id={`${nameId}-analysis`} className="activity-form-input activity-form-analysis"
                            placeholder="我希望可以看到學生在什麼時候會改變立場"
                            value={expectedAnalysis} onChange={e => setExpectedAnalysis(e.target.value)}/>
                    </div>
                </section>
                <hr className="activity-form-divider"/>
                <section className="activity-form-section activity-form-questions" aria-labelledby={`${nameId}-questions`}>
                    {/* 標題右邊是整區的工具：「調整順序」（兩題以上才有）和「AI 出題」（會用到「給 AI 的內容」）。
                        每一區的標題列都會黏在捲動區頂端，捲到下面也按得到 */}
                    <div className="activity-form-section-head">
                        <h3 id={`${nameId}-questions`}>題目資訊</h3>
                        <div className="activity-form-tools">
                            {questions.length > 1 && <button ref={orderButton} type="button" className="activity-form-text-button"
                                onClick={() => setOrderOpen(true)}>
                                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6.5 15.5v-11M3.5 7.5l3-3 3 3M13.5 4.5v11M10.5 12.5l3 3 3-3"/></svg>
                                調整順序
                            </button>}
                            <button type="button" className="activity-form-text-button"
                                onClick={() => { if (onAiAssist) onAiAssist(); else setAiNotice(true); }}>
                                <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.67 1.67V5M18.33 3.33H15M9.18 2.35C9.22 2.16 9.32 1.98 9.47 1.86C9.62 1.73 9.81 1.67 10 1.67C10.19 1.67 10.38 1.73 10.53 1.86C10.68 1.98 10.78 2.16 10.82 2.35L11.7 6.98C11.76 7.31 11.92 7.61 12.15 7.85C12.39 8.08 12.69 8.24 13.02 8.31L17.66 9.18C17.85 9.22 18.02 9.32 18.14 9.47C18.27 9.62 18.34 9.81 18.34 10C18.34 10.2 18.27 10.38 18.14 10.53C18.02 10.68 17.85 10.78 17.66 10.82L13.02 11.7C12.69 11.76 12.39 11.92 12.15 12.16C11.92 12.39 11.76 12.69 11.7 13.02L10.82 17.66C10.78 17.85 10.68 18.02 10.53 18.14C10.38 18.27 10.19 18.34 10 18.34C9.81 18.34 9.62 18.27 9.47 18.14C9.32 18.02 9.22 17.85 9.18 17.66L8.3 13.02C8.24 12.69 8.08 12.39 7.85 12.16C7.61 11.92 7.31 11.76 6.98 11.7L2.34 10.82C2.15 10.78 1.98 10.68 1.86 10.53C1.73 10.38 1.66 10.2 1.66 10C1.66 9.81 1.73 9.62 1.86 9.47C1.98 9.32 2.15 9.22 2.34 9.18L6.98 8.31C7.31 8.24 7.61 8.08 7.85 7.85C8.08 7.61 8.24 7.31 8.3 6.98L9.18 2.35ZM5 16.67C5 17.59 4.25 18.33 3.33 18.33C2.41 18.33 1.67 17.59 1.67 16.67C1.67 15.75 2.41 15 3.33 15C4.25 15 5 15.75 5 16.67Z"/></svg>
                                AI 出題
                            </button>
                        </div>
                    </div>
                    {aiNotice && <p className="activity-form-notice" role="status">AI 出題還沒開放，目前請先手動輸入題目。</p>}
                    {questions.map((q, i) => <div key={q.id} ref={el => { if (el) questionCards.current.set(q.id, el); else questionCards.current.delete(q.id); }}>
                        <QuestionEditor question={q} number={i + 1} total={questions.length} errors={shown(questionErrors.get(q.id)) ?? {}}
                            onChange={patch => editQuestion(q.id, patch)} onRemove={() => removeQuestion(q.id)}/>
                    </div>)}
                    <button type="button" className="activity-form-add-question" onClick={addQuestion}>
                        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.5v11M4.5 10h11"/></svg>
                        新增題目
                    </button>
                </section>
            </div>
            <footer className="activity-form-footer">
                <button type="button" className="activity-form-button" onClick={onClose}>取消</button>
                <button type="button" className="activity-form-button activity-form-button-primary" onClick={confirm}>確認</button>
            </footer>
        </section>
        {orderOpen && <QuestionOrderPanel items={questions.map(q => ({ id: q.id, title: q.title }))}
            onReorder={reorderQuestions} onClose={closeOrder}/>}
    </div>;
}
