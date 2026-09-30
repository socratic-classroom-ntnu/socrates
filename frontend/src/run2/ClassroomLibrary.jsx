import { useCallback, useEffect, useState, useRef } from 'react';
import { api } from './client';
import { ScriptBuilder, newDocument } from './ScriptBuilder';
export function ClassroomLibrary() {
    const [rows, setRows] = useState([]), [selected, setSelected] = useState(''), [workspace, setWorkspace] = useState(null);
    const [editing, setEditing] = useState(null), [title, setTitle] = useState(''), [note, setNote] = useState(''), [busy, setBusy] = useState(false);
    const [bank, setBank] = useState([]);
    const pending = useRef(null);
    const refresh = useCallback(async () => { try {
        setRows(await api('/library/classrooms'));
        setBank(await api('/scripts'));
        if (selected)
            setWorkspace(await api(`/library/classrooms/${selected}`));
    }
    catch (e) {
        setNote(String(e));
    } }, [selected]);
    useEffect(() => { void refresh(); }, [refresh]);
    async function change(path, body) {
        const key = JSON.stringify([path, body]);
        if (busy)
            return null;
        if (pending.current && pending.current.key !== key) {
            setNote('先配對前一操作回執。');
            return null;
        }
        pending.current ??= { key, action_id: crypto.randomUUID() };
        setBusy(true);
        try {
            const result = await api(path, 'POST', { ...body, action_id: pending.current.action_id });
            pending.current = null;
            setNote('已保存。');
            await refresh();
            return result;
        }
        catch (e) {
            if (e.status && Number(e.status) < 500)
                pending.current = null;
            setNote(String(e));
            return null;
        }
        finally {
            setBusy(false);
        }
    }
    return <section className="r73-library"><div className="r2-section-title"><h2>我的教室</h2><label>教室名稱<input value={title} onChange={e => setTitle(e.target.value)}/></label><button disabled={busy || !title.trim()} onClick={() => void change('/library/classrooms', { title: title.trim() }).then(x => { if (x) {
        setSelected(x.id);
        setTitle('');
    } })}>建立教室</button></div>
 <div className="r2-script-grid">{rows.map(c => <button key={c.id} className="r2-card" aria-pressed={selected === c.id} onClick={() => { setSelected(c.id); setEditing(null); }}>{c.title}</button>)}</div>
 {workspace && workspace.id === selected && <article className="r2-card"><h2>{workspace.title}</h2><p>劇本與題庫依教室保存；每次開課的各組 Session 各自記錄完整遊戲。</p>
 <button disabled={busy} onClick={() => void change(`/library/classrooms/${selected}/scripts`, { document: newDocument() }).then(x => x && setEditing(x))}>新增劇本／AI 協助設計</button>
 <label>從既有題庫加入<select value="" onChange={e => void change(`/library/classrooms/${selected}/scripts`, { script_id: e.target.value })}><option value="" disabled>選取題庫劇本</option>{bank.map(s => <option value={s.id} key={s.id}>{s.document.title} · v{s.revision}</option>)}</select></label>
 <div className="r2-script-grid">{workspace.scripts.map(s => <article key={s.id} className="r2-card"><h3>{s.document.title}</h3><p>v{s.revision} · {s.document.questions.length} 題</p><button onClick={() => setEditing(s)}>編輯</button><button disabled={busy} onClick={() => void change(`/library/classrooms/${selected}/batches`, { script_id: s.id }).then(x => { if (x)
            location.href = `/classrooms/${x.id}?mode=teacher`; })}>開課／分組</button></article>)}</div>
 {editing && <ScriptBuilder key={editing.id} initial={editing} onSaved={() => void refresh()}/>}
 <h3>本教室的開課批次與完整遊戲</h3><div className="r2-script-grid">{workspace.sessions.map(s => <a key={s.id} className="r2-card" href={`/classrooms/${s.id}?mode=teacher`}><strong>{s.kind === 'SESSION' ? '組別 Session' : '開課批次'}</strong><span>{s.title} · {s.phase}</span><small>{s.batch_id}</small></a>)}</div></article>}
 <p role="status">{note}</p></section>;
}
