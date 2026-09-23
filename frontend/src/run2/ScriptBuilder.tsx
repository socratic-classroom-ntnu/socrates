import { useState } from 'react'
import { api, exportYAML, importYAML, type ScriptDoc, type Question } from './client'
const question=():Question=>({id:crypto.randomUUID(),title:'新的問題',scenario:'在這裡寫下情境。',
  options:[{id:'a',text:'選項 A'},{id:'b',text:'選項 B'},{id:'c',text:'選項 C'}],duration_seconds:90,
  argument_required:true,tutor_goal:'協助學生照見自己採用的原則',probe_hints:['你最重視哪一個理由？'],
  max_focus_turns:3,focus_response_seconds:90,sender_point_cap:5,receiver_point_cap:25})
export function newDocument():ScriptDoc { return {title:'我的蘇格拉底教室',mode:'static',questions:[question()],
  max_questions:3,preview_seconds:8,live_llm_call_budget:30} }
export function ScriptBuilder({initial,onSaved}:{initial?:{id:string;revision:number;document:ScriptDoc};onSaved:()=>void}) {
  const [doc,setDoc]=useState<ScriptDoc>(initial?.document||newDocument())
  const [identity,setIdentity]=useState(initial?{id:initial.id,revision:initial.revision}:null)
  const [yaml,setYaml]=useState('');const [message,setMessage]=useState('');const [drag,setDrag]=useState<number|null>(null)
  function edit(index:number,patch:Partial<Question>){setDoc(x=>({...x,questions:x.questions.map((q,i)=>i===index?{...q,...patch}:q)}))}
  async function save(){try{const x=await api<{id:string;revision:number}>(identity?`/scripts/${identity.id}`:'/scripts',identity?'PUT':'POST',{document:doc,...(identity?{expected_revision:identity.revision}:{})});setIdentity(x);setMessage('草稿已儲存；開始教室時固定本次版本。');onSaved()}catch(e){setMessage(String(e))}}
  return <section className="r2-builder"><div className="r2-section-title"><div><small>TEACHER STUDIO</small><h2>設計一場值得討論的課</h2></div><button onClick={()=>void save()}>儲存草稿</button></div>
    <label>劇本名稱<input value={doc.title} onChange={e=>setDoc({...doc,title:e.target.value})}/></label>
    <div className="r2-grid"><label>題目模式<select value={doc.mode} onChange={e=>setDoc({...doc,mode:e.target.value as ScriptDoc['mode']})}><option value="static">教師預先編輯</option><option value="dynamic">初始題＋LLM 動態出題</option></select></label>
    <label>動態題目總數<input type="number" min="1" value={doc.max_questions} onChange={e=>setDoc({...doc,max_questions:+e.target.value})}/></label>
    <label>Live LLM 額度<input type="number" min="0" value={doc.live_llm_call_budget} onChange={e=>setDoc({...doc,live_llm_call_budget:+e.target.value})}/></label></div>
    {doc.questions.map((q,i)=><article className="r2-question-card" key={q.id} draggable onDragStart={()=>setDrag(i)} onDragOver={e=>e.preventDefault()} onDrop={()=>{if(drag===null)return;const qs=[...doc.questions];const [m]=qs.splice(drag,1);qs.splice(i,0,m);setDoc({...doc,questions:qs});setDrag(null)}}>
      <header><span>⠿ 情境 {i+1}</span><button className="quiet" onClick={()=>setDoc({...doc,questions:doc.questions.filter((_,j)=>j!==i)})}>移除本題</button></header>
      <label>標題<input value={q.title} onChange={e=>edit(i,{title:e.target.value})}/></label>
      <label>情境敘述<textarea value={q.scenario} onChange={e=>edit(i,{scenario:e.target.value})}/></label>
      {q.options.map((o,j)=><div className="r2-option-edit" key={o.id}><span>{j+1}</span><input aria-label={`選項 ${j+1}`} value={o.text} onChange={e=>edit(i,{options:q.options.map((x,k)=>k===j?{...x,text:e.target.value}:x)})}/><button className="quiet" onClick={()=>edit(i,{options:q.options.filter((_,k)=>k!==j)})}>移除</button></div>)}
      <button className="quiet" onClick={()=>edit(i,{options:[...q.options,{id:crypto.randomUUID(),text:'新選項'}]})}>＋ 選項</button>
      <div className="r2-grid"><label>作答秒數<input type="number" min="1" value={q.duration_seconds} onChange={e=>edit(i,{duration_seconds:+e.target.value})}/></label><label>每位代表最多來回<input type="number" min="1" value={q.max_focus_turns} onChange={e=>edit(i,{max_focus_turns:+e.target.value})}/></label><label>論點欄位<select value={q.argument_required?'required':'optional'} onChange={e=>edit(i,{argument_required:e.target.value==='required'})}><option value="required">必填理由</option><option value="optional">理由可留空</option></select></label></div>
      <details><summary>導師引導與互動積分</summary><label>教學目標<textarea value={q.tutor_goal} onChange={e=>edit(i,{tutor_goal:e.target.value})}/></label><label>備用追問（每行一句）<textarea value={(q.probe_hints||[]).join('\n')} onChange={e=>edit(i,{probe_hints:e.target.value.split('\n')})}/></label><div className="r2-grid"><label>送出者每回合積分上限<input type="number" min="0" value={q.sender_point_cap} onChange={e=>edit(i,{sender_point_cap:+e.target.value})}/></label><label>接收者每回合積分上限<input type="number" min="0" value={q.receiver_point_cap} onChange={e=>edit(i,{receiver_point_cap:+e.target.value})}/></label></div></details>
    </article>)}
    <button className="quiet" onClick={()=>setDoc({...doc,questions:[...doc.questions,question()]})}>＋ 新增題目</button>
    <details><summary>YAML 匯入／匯出</summary><textarea className="r2-code" value={yaml} onChange={e=>setYaml(e.target.value)}/><div className="r2-row"><button onClick={()=>void importYAML(yaml).then(()=>{setMessage('已匯入新草稿');onSaved()}).catch(e=>setMessage(String(e)))}>匯入為新草稿</button><button onClick={()=>identity&&void exportYAML(identity.id).then(setYaml)}>顯示已儲存版本 YAML</button></div></details>
    <p role="status">{message}</p>
  </section>
}
