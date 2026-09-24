import { useEffect, useId, useRef, useState } from 'react'
import './composer.css'

type Result = { isFinal: boolean; 0: { transcript: string; confidence?: number } }
type SpeechEvent = { results: { length: number; [index: number]: Result } }
type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean
  start(): void; stop(): void; abort(): void
  onresult: ((event: SpeechEvent) => void) | null
  onend: (() => void) | null
  onerror: ((event: { error?: string }) => void) | null
}
type SpeechWindow = { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
export interface TranscriptMeta { adapter: 'browser-speech'; locale: 'zh-TW'; confidence?: number; final: boolean }
export interface ComposerProps {
  value: string; onChange(value: string): void
  onSend(): void | Promise<unknown>
  enabled?: boolean; busy?: boolean; canSend?: boolean
  label?: string; placeholder?: string; autoFocus?: boolean
  onListening?(active: boolean): void
  onTranscript?(text: string, meta: TranscriptMeta): void
}
export function transcriptText(base: string, event: SpeechEvent): {text: string; confidence?: number; final: boolean} {
  let text = ''; let confidence: number | undefined; let final = true
  for (let i = 0; i < event.results.length; i += 1) {
    const result = event.results[i]
    text += result[0]?.transcript || ''
    final = final && result.isFinal
    if (result.isFinal) confidence = result[0]?.confidence
  }
  return { text: base + (base && text ? ' ' : '') + text, confidence, final }
}
function MicIcon({active}:{active:boolean}) {
  return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
    {active?<rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none"/>:<><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 10v1.5a6.5 6.5 0 0 0 13 0V10M12 18v3.5M8.5 21.5h7"/></>}
  </svg>
}
export function DraftComposer({value,onChange,onSend,enabled=true,busy=false,canSend,label='文字輸入',placeholder='輸入文字或使用語音…',autoFocus=false,onListening,onTranscript}:ComposerProps) {
  const id=useId(), [active,setActive]=useState(false), [sending,setSending]=useState(false), [note,setNote]=useState('')
  const recognition=useRef<Recognition|null>(null), lock=useRef(false), latest=useRef(value)
  const callbacks=useRef({onChange,onSend,onListening,onTranscript});callbacks.current={onChange,onSend,onListening,onTranscript};latest.current=value
  const [supported]=useState(()=>{const w=window as unknown as SpeechWindow;return !!(w.SpeechRecognition||w.webkitSpeechRecognition)})
  function end(){setActive(false);callbacks.current.onListening?.(false)}
  function stop(abort=false){const r=recognition.current;recognition.current=null;if(r){r.onresult=null;r.onend=null;r.onerror=null;try{if(abort)r.abort();else r.stop()}catch{/* Current draft remains available. */}}end()}
  useEffect(()=>()=>{const r=recognition.current;recognition.current=null;if(r){r.onresult=null;r.onend=null;r.onerror=null;try{r.abort()}catch{/* Browser lifecycle owns cleanup. */}}callbacks.current.onListening?.(false)},[])
  useEffect(()=>{if(!enabled||busy){const r=recognition.current;recognition.current=null;if(r){r.onresult=null;r.onend=null;r.onerror=null;try{r.abort()}catch{/* Browser lifecycle owns cleanup. */}}setActive(false);callbacks.current.onListening?.(false)}},[enabled,busy])
  function toggle(){
    if(!enabled||busy)return
    if(active){stop();return}
    const w=window as unknown as SpeechWindow,Ctor=w.SpeechRecognition||w.webkitSpeechRecognition
    if(!Ctor){setNote('此瀏覽器使用文字輸入；語音可於支援 Web Speech 的瀏覽器開啟。');return}
    const r=new Ctor(),base=latest.current
    recognition.current=r;r.lang='zh-TW';r.continuous=false;r.interimResults=true
    r.onresult=e=>{if(recognition.current!==r)return;const result=transcriptText(base,e);latest.current=result.text;callbacks.current.onChange(result.text);callbacks.current.onTranscript?.(result.text,{adapter:'browser-speech',locale:'zh-TW',confidence:result.confidence,final:result.final})}
    r.onend=()=>{if(recognition.current===r){recognition.current=null;end()}}
    r.onerror=e=>{if(recognition.current===r){recognition.current=null;end();setNote(e.error==='not-allowed'?'請在瀏覽器網站設定允許麥克風，再按左側麥克風。':'請確認麥克風與語音服務連線；目前文字已保留。')}}
    try{r.start();setActive(true);callbacks.current.onListening?.(true);setNote('正在聆聽，文字會即時呈現。')}catch{recognition.current=null;end();setNote('請確認麥克風權限後再開始；文字輸入持續可用。')}
  }
  async function send(){if(lock.current||!enabled||busy||(canSend===undefined?!latest.current.trim():!canSend))return;lock.current=true;setSending(true);stop();try{await callbacks.current.onSend()}catch{setNote('文字已保留，請在連線恢復後再次送出。')}finally{lock.current=false;setSending(false)}}
  return <div className="socratic-composer" data-input-layout="mic-text-enter">
    <div className="socratic-composer-row">
      <button className={'socratic-mic '+(active?'listening':'')} type="button" aria-label={active?'停止語音輸入':'開始語音輸入'} aria-pressed={active} disabled={!enabled||busy} title={supported?'語音輸入':'文字輸入可用；語音請使用支援的瀏覽器'} onClick={toggle}><MicIcon active={active}/></button>
      <label className="socratic-visually-hidden" htmlFor={id}>{label}</label>
      <textarea id={id} autoFocus={autoFocus} value={value} placeholder={placeholder} disabled={!enabled||busy} onChange={e=>{if(active)stop(true);latest.current=e.target.value;onChange(e.target.value)}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing&&e.keyCode!==229){e.preventDefault();void send()}}}/>
      <button className="socratic-enter" type="button" aria-label="傳送" title="Enter 傳送；Shift＋Enter 換行" disabled={!enabled||busy||sending||(canSend===undefined?!value.trim():!canSend)} onClick={()=>void send()}><svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M19 4v8a3 3 0 0 1-3 3H5m5-5-5 5 5 5"/></svg></button>
    </div>
    <div className="socratic-composer-caption"><span role="status" aria-live="polite">{active?'正在聆聽…':note||'文字／語音輸入'}</span><span>Enter 傳送 · Shift＋Enter 換行</span></div>
  </div>
}
