import React, {useState} from 'react'
import type {ScriptDoc} from './client'
/** Run 1 uses an explicit fixed-response fixture and the existing ScriptDocument. */
export function ScriptAssist({document,onApply}:{document:ScriptDoc;onApply:(value:ScriptDoc)=>void}){
 const [topic,setTopic]=useState(''),[goal,setGoal]=useState('協助學生辨識自己的理由與條件'),[mode,setMode]=useState<'static'|'dynamic'>('dynamic')
 function apply(){const baseline=document.questions[0];if(!baseline||!topic.trim())return;onApply({...document,title:topic.trim().slice(0,160),mode,
  questions:[{...baseline,id:crypto.randomUUID(),title:topic.trim().slice(0,160),scenario:topic.trim(),tutor_goal:goal,
   probe_hints:['請說明你最重視的理由。','哪一個條件改變時，你會重新思考？','這份說明如何反映你現在的真實觀點？']}],max_questions:Math.max(3,document.max_questions)})}
 return <details className="r2-card"><summary>AI 協助設計 · Run 1 固定回覆測試</summary><p>本次以固定追問模板驗證編輯與儲存流程；老師可在原編輯器調整每個欄位。</p>
 <label>討論起點<textarea rows={3} value={topic} onChange={e=>setTopic(e.target.value)}/></label><label>教學目標<input value={goal} onChange={e=>setGoal(e.target.value)}/></label>
 <label>後續內容<select value={mode} onChange={e=>setMode(e.target.value as 'static'|'dynamic')}><option value="dynamic">初始題 → 各組接續</option><option value="static">教師編輯 Flow</option></select></label>
 <button type="button" disabled={!topic.trim()||!document.questions.length} onClick={apply}>填入目前劇本編輯器</button></details>
}
