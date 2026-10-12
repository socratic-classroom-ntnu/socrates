import { useCallback, useEffect, useRef, useState } from 'react';
import { applySuggestion, ScriptAssist } from './ScriptAssist';
import { SamplePicker } from './SamplePicker';
import { BankPicker } from '../question-bank/BankPicker';
import { ScenarioModelSelect } from './ScenarioModelSelect';
import { ApiError, api, exportYAML, importYAML } from '../../api/classroomClient';
import { fieldErrorsFrom422, validateDocument } from './validate';
const question = () => ({ id: crypto.randomUUID(), title: '新的問題', scenario: '在這裡寫下情境。',
    options: [{ id: 'a', text: '選項 A' }, { id: 'b', text: '選項 B' }, { id: 'c', text: '選項 C' }], duration_seconds: 90,
    argument_required: true, tutor_goal: '協助學生照見自己採用的原則', probe_hints: ['你最重視哪一個理由？'],
    max_focus_turns: 3, focus_response_seconds: 90, sender_point_cap: 5, receiver_point_cap: 25,
    max_personal_turns: 6, personal_seconds: 600 });
export function newDocument() {
    return { title: '我的蘇格拉底教室', mode: 'static', questions: [question()],
        max_questions: 3, preview_seconds: 8, live_llm_call_budget: 240 };
}
export function ScriptBuilder({ initial, onSaved, onDirtyChange = undefined }) {
    const [doc, setDoc] = useState(initial?.document || newDocument());
    const [identity, setIdentity] = useState(initial ? { id: initial.id, revision: initial.revision } : null);
    const [yaml, setYaml] = useState('');
    const [message, setMessage] = useState('');
    const [drag, setDrag] = useState(null);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState([]);
    const [importingYAML, setImportingYAML] = useState(false);
    const [yamlErrors, setYamlErrors] = useState([]);
    // 單題 AI 模型選單用的連線清單：第一次用到時才讀（null＝尚未讀取）。
    const [profiles, setProfiles] = useState(null);
    const [profileNote, setProfileNote] = useState('');
    const profilesRequested = useRef(false);
    const loadProfiles = useCallback(() => {
        if (profilesRequested.current)
            return;
        profilesRequested.current = true;
        setProfileNote('');
        Promise.resolve(api('/provider-profiles')).then(rows => setProfiles(Array.isArray(rows) ? rows : [])).catch(e => {
            profilesRequested.current = false;
            setProfileNote(e instanceof ApiError ? e.message : String(e));
        });
    }, []);
    // 「從題庫加入」「範例題目」：同一時間只展開一個；選中的題目放進草稿，仍由老師自己儲存。
    const [source, setSource] = useState('');
    function addQuestion(picked, origin) {
        setErrors([]);
        setDoc(current => applySuggestion(current, { question: picked, question_index: null }));
        return `已從${origin}加入「${picked.title}」到草稿最後；確認內容後記得儲存草稿。`;
    }
    // 最後一次儲存（或打開時）的內容；目前內容與它不同＝有未儲存的修改。
    const saved = useRef(JSON.stringify(doc));
    const dirty = JSON.stringify(doc) !== saved.current;
    const hasScenarioAI = doc.questions.some(q => q.scenario_ai);
    useEffect(() => { if (hasScenarioAI)
        loadProfiles(); }, [hasScenarioAI, loadProfiles]);
    useEffect(() => { onDirtyChange?.(dirty); }, [dirty, onDirtyChange]);
    useEffect(() => {
        if (!dirty)
            return;
        const guard = e => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', guard);
        return () => window.removeEventListener('beforeunload', guard);
    }, [dirty]);
    const invalid = path => errors.some(e => e.path === path || e.path.startsWith(`${path}.`));
    function clearErrors(...paths) {
        setErrors(current => current.filter(error => !paths.some(path => error.path === path || error.path.startsWith(`${path}.`) || path.startsWith(`${error.path}.`))));
    }
    function editDocument(path, patch) {
        clearErrors(path);
        setDoc(current => ({ ...current, ...patch }));
    }
    function edit(index, patch) {
        clearErrors(...Object.keys(patch).map(key => `questions.${index}.${key}`));
        setDoc(current => ({ ...current, questions: current.questions.map((q, i) => i === index ? { ...q, ...patch } : q) }));
    }
    async function save() {
        if (saving)
            return;
        const problems = validateDocument(doc);
        if (problems.length) {
            setErrors(problems);
            setMessage(`有 ${problems.length} 個欄位要修改，修改後再儲存。`);
            return;
        }
        setSaving(true);
        setErrors([]);
        try {
            const x = await api(identity ? `/scripts/${identity.id}` : '/scripts', identity ? 'PUT' : 'POST', { document: doc, ...(identity ? { expected_revision: identity.revision } : {}) });
            setIdentity(x);
            saved.current = JSON.stringify(doc);
            setMessage('草稿已儲存；開始教室時固定本次版本。');
            await onSaved?.(x);
        }
        catch (e) {
            if (e instanceof ApiError && e.status === 422) {
                if (Array.isArray(e.detail)) {
                    const fields = fieldErrorsFrom422(e.detail);
                    setErrors(fields);
                    setMessage(`伺服器退回：有 ${fields.length} 個欄位要修改。`);
                }
                else {
                    setMessage(typeof e.detail === 'string' && e.detail.trim()
                        ? e.message
                        : '題目內容需要調整，請依畫面欄位提示修改。');
                }
            }
            else
                setMessage(e instanceof ApiError ? e.message : String(e));
        }
        finally {
            setSaving(false);
        }
    }
    async function importDraft() {
        if (importingYAML)
            return;
        if (!yaml.trim()) {
            setYamlErrors([{ path: 'yaml', message: '請貼上 YAML 內容。' }]);
            setMessage('YAML 匯入前需要內容。');
            return;
        }
        setImportingYAML(true);
        setYamlErrors([]);
        try {
            const imported = await importYAML(yaml);
            setMessage('已匯入新草稿');
            await onSaved?.(imported);
        }
        catch (e) {
            if (e instanceof ApiError && e.status === 422) {
                if (Array.isArray(e.detail)) {
                    const fields = fieldErrorsFrom422(e.detail);
                    const current = fields.length ? fields : [{ path: 'yaml', message: 'YAML 內容不符合劇本格式。' }];
                    setYamlErrors(current);
                    setMessage(`YAML 匯入有 ${current.length} 個欄位要修改。`);
                }
                else {
                    const detail = typeof e.detail === 'string' && e.detail.trim()
                        ? e.detail
                        : 'YAML 內容不符合劇本格式。';
                    setYamlErrors([{ path: 'yaml', message: detail }]);
                    setMessage('YAML 匯入格式待修改。');
                }
            }
            else
                setMessage(e instanceof ApiError ? e.message : String(e));
        }
        finally {
            setImportingYAML(false);
        }
    }
    return <section className="r2-builder"><div className="r2-section-title"><div><small>課堂題目編輯</small><h2>設計一場值得討論的課</h2></div><button onClick={() => void save()} disabled={saving} aria-busy={saving}>{saving ? '儲存中…' : '儲存草稿'}</button></div>
    {dirty && <p className="r2-dirty">有尚未儲存的修改</p>}
    {errors.length > 0 && <ul className="r2-field-errors" role="alert">{errors.map(e => <li key={`${e.path}:${e.message}`}>{e.message}</li>)}</ul>}
    <details><summary>AI 協助出題（選用）</summary><ScriptAssist document={doc} scriptId={identity?.id ?? null} onApply={value => { setErrors([]); setDoc(value); }}/></details>
    <div className="r2-row"><button type="button" className="quiet" aria-expanded={source === 'bank'} onClick={() => setSource(source === 'bank' ? '' : 'bank')}>從題庫加入</button><button type="button" className="quiet" aria-expanded={source === 'samples'} onClick={() => setSource(source === 'samples' ? '' : 'samples')}>範例題目</button></div>
    {source === 'bank' && <BankPicker onPick={picked => addQuestion(picked, '題庫')}/>}
    {source === 'samples' && <SamplePicker onPick={picked => addQuestion(picked, '範例題目')}/>}
    <label>劇本名稱<input aria-invalid={invalid('title')} value={doc.title} onChange={e => editDocument('title', { title: e.target.value })}/></label>
    <div className="r2-grid"><label>題目模式<select value={doc.mode} onChange={e => editDocument('mode', { mode: e.target.value })}><option value="static">教師預先編輯</option><option value="dynamic">初始題＋AI 動態出題</option></select></label>
    <label>動態題目總數<input type="number" min="1" aria-invalid={invalid('max_questions')} value={doc.max_questions} onChange={e => editDocument('max_questions', { max_questions: +e.target.value })}/></label>
    <label>預覽秒數<input type="number" min="5" max="10" aria-invalid={invalid('preview_seconds')} value={doc.preview_seconds ?? ''} onChange={e => editDocument('preview_seconds', { preview_seconds: +e.target.value })}/></label>
    <label>AI 呼叫次數上限<input type="number" min="0" aria-invalid={invalid('live_llm_call_budget')} value={doc.live_llm_call_budget} onChange={e => editDocument('live_llm_call_budget', { live_llm_call_budget: +e.target.value })}/></label></div>
    {doc.questions.map((q, i) => <article className="r2-question-card" key={q.id} draggable onDragStart={() => setDrag(i)} onDragOver={e => e.preventDefault()} onDrop={() => { if (drag === null)
            return; const qs = [...doc.questions]; const [m] = qs.splice(drag, 1); qs.splice(i, 0, m); setDoc({ ...doc, questions: qs }); setDrag(null); }}>
      <header><span>⠿ 情境 {i + 1}</span><button className="quiet" onClick={() => setDoc({ ...doc, questions: doc.questions.filter((_, j) => j !== i) })} disabled={doc.questions.length <= 1}>移除本題</button></header>
      <label>標題<input aria-invalid={invalid(`questions.${i}.title`)} value={q.title} onChange={e => edit(i, { title: e.target.value })}/></label>
      <label>情境敘述<textarea aria-invalid={invalid(`questions.${i}.scenario`)} value={q.scenario} onChange={e => edit(i, { scenario: e.target.value })}/></label>
      {q.options.map((o, j) => <div className="r2-option-edit" key={o.id}><span>{j + 1}</span><input aria-label={`選項 ${j + 1}`} aria-invalid={invalid(`questions.${i}.options.${j}`) || errors.some(e => e.path === `questions.${i}.options`)} value={o.text} onChange={e => edit(i, { options: q.options.map((x, k) => k === j ? { ...x, text: e.target.value } : x) })}/><button className="quiet" onClick={() => edit(i, { options: q.options.filter((_, k) => k !== j) })}>移除</button></div>)}
      <button className="quiet" onClick={() => edit(i, { options: [...q.options, { id: crypto.randomUUID(), text: '新選項' }] })}>＋ 選項</button>
      <div className="r2-grid"><label>作答秒數<input type="number" min="1" aria-invalid={invalid(`questions.${i}.duration_seconds`)} value={q.duration_seconds} onChange={e => edit(i, { duration_seconds: +e.target.value })}/></label><label>每位代表最多來回<input type="number" min="1" aria-invalid={invalid(`questions.${i}.max_focus_turns`)} value={q.max_focus_turns} onChange={e => edit(i, { max_focus_turns: +e.target.value })}/></label><label>追問回應秒數<input type="number" min="5" aria-invalid={invalid(`questions.${i}.focus_response_seconds`)} value={q.focus_response_seconds ?? ''} onChange={e => edit(i, { focus_response_seconds: +e.target.value })}/></label><label>個人對話回覆上限（分組）<input type="number" min="1" max="20" aria-invalid={invalid(`questions.${i}.max_personal_turns`)} value={q.max_personal_turns ?? 6} onChange={e => edit(i, { max_personal_turns: +e.target.value })}/></label><label>個人對話秒數（分組）<input type="number" min="30" aria-invalid={invalid(`questions.${i}.personal_seconds`)} value={q.personal_seconds ?? 600} onChange={e => edit(i, { personal_seconds: +e.target.value })}/></label><label>論點欄位<select value={q.argument_required ? 'required' : 'optional'} onChange={e => edit(i, { argument_required: e.target.value === 'required' })}><option value="required">必填理由</option><option value="optional">理由可留空</option></select></label></div>
      <details><summary>導師引導、AI 模型與互動積分</summary><label>教學目標<textarea value={q.tutor_goal} onChange={e => edit(i, { tutor_goal: e.target.value })}/></label><label>備用追問（每行一句）<textarea value={(q.probe_hints || []).join('\n')} onChange={e => edit(i, { probe_hints: e.target.value.split('\n') })}/></label><ScenarioModelSelect index={i} value={q.scenario_ai} profiles={profiles} onNeedProfiles={loadProfiles} note={profileNote} onChange={value => edit(i, { scenario_ai: value })}/><div className="r2-grid"><label>送出者每回合積分上限<input type="number" min="0" aria-invalid={invalid(`questions.${i}.sender_point_cap`)} value={q.sender_point_cap} onChange={e => edit(i, { sender_point_cap: +e.target.value })}/></label><label>接收者每回合積分上限<input type="number" min="0" aria-invalid={invalid(`questions.${i}.receiver_point_cap`)} value={q.receiver_point_cap} onChange={e => edit(i, { receiver_point_cap: +e.target.value })}/></label></div></details>
    </article>)}
    <button className="quiet" onClick={() => setDoc({ ...doc, questions: [...doc.questions, question()] })}>＋ 新增題目</button>
    <details><summary>YAML 匯入／匯出</summary><textarea className="r2-code" aria-label="YAML 內容" aria-invalid={yamlErrors.length > 0} value={yaml} onChange={e => { setYaml(e.target.value); if (yamlErrors.length)
            setYamlErrors([]); }}/>{yamlErrors.length > 0 && <ul className="r2-field-errors" role="alert" aria-label="YAML 匯入錯誤">{yamlErrors.map(e => <li key={`${e.path}:${e.message}`}>{e.message}</li>)}</ul>}<div className="r2-row"><button onClick={() => void importDraft()} disabled={importingYAML} aria-busy={importingYAML}>{importingYAML ? '匯入中…' : '匯入為新草稿'}</button><button disabled={!identity} onClick={() => identity && void exportYAML(identity.id).then(setYaml).catch(error => setMessage(error instanceof ApiError ? error.message : String(error)))}>顯示已儲存版本 YAML</button></div></details>
    <p role="status">{message}</p>
  </section>;
}
