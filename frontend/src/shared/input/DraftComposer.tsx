import { useEffect, useId, useRef, useState } from 'react';
import './composer.css';
export function transcriptText(base, event) {
    let text = '';
    let confidence;
    let final = true;
    for (let i = 0; i < event.results.length; i += 1) {
        const result = event.results[i];
        text += result[0]?.transcript || '';
        final = final && result.isFinal;
        if (result.isFinal)
            confidence = result[0]?.confidence;
    }
    return { text: base + (base && text ? ' ' : '') + text, confidence, final };
}
function MicIcon({ active }) {
    return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    {active ? <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/> : <><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 10v1.5a6.5 6.5 0 0 0 13 0V10M12 18v3.5M8.5 21.5h7"/></>}
  </svg>;
}
export type DraftComposerProps = {
  value: string
  onChange: (value: string) => void
  onSend: () => unknown
  enabled?: boolean
  busy?: boolean
  canSend?: boolean
  label?: string
  placeholder?: string
  autoFocus?: boolean
  onListening?: (listening: boolean) => void
  onTranscript?: (text: string, meta: { adapter: string; locale: string; confidence?: number; final: boolean }) => void
  ghostText?: string
  onGhostAccepted?: (text: string) => void
  /** 與後端欄位上限一致（作答／導師回覆 12000、彈幕 500）。 */
  maxLength?: number
}

/** Web Speech 錯誤碼 → 使用者看得懂、做得到的說明。 */
export function speechErrorNote(code) {
    switch (code) {
        case 'not-allowed':
        case 'service-not-allowed':
            return '麥克風沒有被允許：請在網址列左側的網站設定允許麥克風，再按麥克風。';
        case 'network':
            return '這個瀏覽器連不到語音辨識服務（Helium、Brave 等去除 Google 服務的瀏覽器沒有內建語音辨識）；請改用 Chrome 或 Edge，或直接打字。';
        case 'audio-capture':
            return '找不到可用的麥克風，請確認麥克風已接上且沒有被其他程式占用。';
        case 'no-speech':
            return '沒有聽到聲音，請靠近麥克風再按一次。';
        case 'language-not-supported':
            return '這個瀏覽器的語音辨識不支援繁體中文，請改用 Chrome 或 Edge。';
        default:
            return `語音辨識中斷（${code || '未知原因'}）；目前文字已保留，可以再按一次或直接打字。`;
    }
}
export function DraftComposer({ value, onChange, onSend, enabled = true, busy = false, canSend, label = '文字輸入', placeholder = '輸入文字或使用語音…', autoFocus = false, onListening, onTranscript, ghostText = '', onGhostAccepted, maxLength = 12000 }: DraftComposerProps) {
    const id = useId(), [active, setActive] = useState(false), [sending, setSending] = useState(false), [note, setNote] = useState('');
    const recognition = useRef(null), lock = useRef(false), latest = useRef(value);
    const callbacks = useRef({ onChange, onSend, onListening, onTranscript });
    callbacks.current = { onChange, onSend, onListening, onTranscript };
    latest.current = value;
    const [supported] = useState(() => { const w = window; return !!(w.SpeechRecognition || w.webkitSpeechRecognition); });
    function end() { setActive(false); callbacks.current.onListening?.(false); }
    function stop(abort = false) { const r = recognition.current; recognition.current = null; if (r) {
        r.onresult = null;
        r.onend = null;
        r.onerror = null;
        try {
            if (abort)
                r.abort();
            else
                r.stop();
        }
        catch { /* Current draft remains available. */ }
    } end(); }
    useEffect(() => () => { const r = recognition.current; recognition.current = null; if (r) {
        r.onresult = null;
        r.onend = null;
        r.onerror = null;
        try {
            r.abort();
        }
        catch { /* Browser lifecycle owns cleanup. */ }
    } callbacks.current.onListening?.(false); }, []);
    useEffect(() => { if (!enabled || busy) {
        const r = recognition.current;
        recognition.current = null;
        if (r) {
            r.onresult = null;
            r.onend = null;
            r.onerror = null;
            try {
                r.abort();
            }
            catch { /* Browser lifecycle owns cleanup. */ }
        }
        setActive(false);
        callbacks.current.onListening?.(false);
    } }, [enabled, busy]);
    function toggle() {
        if (!enabled || busy)
            return;
        if (active) {
            stop();
            return;
        }
        const w = window, Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
        if (!Ctor) {
            setNote('此瀏覽器使用文字輸入；語音可於支援 Web Speech 的瀏覽器開啟。');
            return;
        }
        const r = new Ctor(), base = latest.current;
        let heard = false, failed = false;
        recognition.current = r;
        r.lang = 'zh-TW';
        r.continuous = false;
        r.interimResults = true;
        r.onresult = e => { if (recognition.current !== r)
            return; heard = true; const result = transcriptText(base, e); latest.current = result.text; callbacks.current.onChange(result.text); callbacks.current.onTranscript?.(result.text, { adapter: 'browser-speech', locale: 'zh-TW', confidence: result.confidence, final: result.final }); };
        r.onend = () => { if (recognition.current === r) {
            recognition.current = null;
            end();
            if (!heard && !failed)
                setNote('沒有辨識到語音，請靠近麥克風再按一次；也可以直接打字。');
        } };
        r.onerror = e => { failed = true; if (recognition.current === r) {
            recognition.current = null;
            end();
            setNote(speechErrorNote(e.error));
        } };
        try {
            r.start();
            setActive(true);
            callbacks.current.onListening?.(true);
            setNote('正在聆聽，文字會即時呈現。');
        }
        catch {
            recognition.current = null;
            end();
            setNote('請確認麥克風權限後再開始；文字輸入持續可用。');
        }
    }
    async function send() { if (lock.current || !enabled || busy || (canSend === undefined ? !latest.current.trim() : !canSend))
        return; lock.current = true; setSending(true); stop(); try {
        await callbacks.current.onSend();
    }
    catch {
        setNote('文字已保留，請在連線恢復後再次送出。');
    }
    finally {
        lock.current = false;
        setSending(false);
    } }
    return <div className="socratic-composer" data-input-layout="mic-text-enter">
    <div className="socratic-composer-row">
      <button className={'socratic-mic ' + (active ? 'listening' : '')} type="button" aria-label={active ? '停止語音輸入' : '開始語音輸入'} aria-pressed={active} disabled={!enabled || busy} title={supported ? '語音輸入' : '文字輸入可用；語音請使用支援的瀏覽器'} onClick={toggle}><MicIcon active={active}/></button>
      <label className="socratic-visually-hidden" htmlFor={id}>{label}</label>
      <textarea id={id} maxLength={maxLength} autoFocus={autoFocus} value={value} placeholder={ghostText && !value ? ghostText : placeholder} disabled={!enabled || busy} onChange={e => { if (active)
        stop(true); latest.current = e.target.value; onChange(e.target.value); }} onKeyDown={e => { if (e.key === 'Tab' && ghostText && !value) { e.preventDefault(); latest.current = ghostText; onChange(ghostText); onGhostAccepted?.(ghostText); return; } if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
        e.preventDefault();
        void send();
    } }}/>
      <button className="socratic-enter" type="button" aria-label="傳送" title="Enter 傳送；Shift＋Enter 換行" disabled={!enabled || busy || sending || (canSend === undefined ? !value.trim() : !canSend)} onClick={() => void send()}><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M19 4v8a3 3 0 0 1-3 3H5m5-5-5 5 5 5"/></svg><span>{sending || busy ? '送出中' : '送出'}</span></button>
    </div>
    {ghostText && !value && <button type="button" className="ghost-accept" onClick={() => { latest.current = ghostText; onChange(ghostText); onGhostAccepted?.(ghostText); }}>採用 AI 奇思妙想</button>}
    <div className="socratic-composer-caption"><span role="status" aria-live="polite">{active ? '正在聆聽…' : note || '文字／語音輸入'}</span><span>Enter 傳送 · Shift＋Enter 換行</span></div>
  </div>;
}
