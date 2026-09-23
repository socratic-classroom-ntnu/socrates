import { useCallback, useEffect, useRef, useState } from 'react'
import { api, command, setCSRF, type Account, type Room, type ScriptDoc } from './client'
import { Arena } from './Arena'
import { ScriptBuilder } from './ScriptBuilder'
import { DraftComposer } from '../shared/input/DraftComposer'
import './style.css'

type ScriptRow={id:string;revision:number;document:ScriptDoc}
type Focus={id:string;member_id:string;turn_index:number;status:string;messages:{role:string;text:string}[];micro_summary:string}
type Summary={status:string;text?:string;key_points?:string[]}
type Statistics={index:number;title:string;distribution:{text:string;count:number;percent:number}[]}
const errorText=(e:unknown)=>e instanceof Error?e.message:String(e)

function Auth({onLogin}:{onLogin:(a:Account)=>void}) {
  const [mode,setMode]=useState<'login'|'register'|'forgot'|'reset'>('login')
  const [name,setName]=useState(''),[email,setEmail]=useState(''),[password,setPassword]=useState('')
  const [note,setNote]=useState(''),[busy,setBusy]=useState(false)
  const query=new URLSearchParams(location.search)
  useEffect(()=>{const token=new URLSearchParams(location.search).get('verify_token');if(token)void api('/auth/verify','POST',{token}).then(()=>{setNote('Email 已驗證，請登入。');history.replaceState({},'','/')}).catch(e=>setNote(errorText(e)))
    if(new URLSearchParams(location.search).has('reset_token'))setMode('reset')},[])
  async function submit(){setBusy(true);try{
    if(mode==='login'){const a=await api<Account>('/auth/login','POST',{login:name,password});setCSRF(a.csrf_token);onLogin(a)}
    if(mode==='register'){await api('/auth/register','POST',{username:name,email,password});setNote('帳號已建立，請從 Email 開啟驗證連結。');setMode('login')}
    if(mode==='forgot'){await api('/auth/forgot-password','POST',{email});setNote('重設郵件已排入寄送；請查看信箱。')}
    if(mode==='reset'){await api('/auth/reset-password','POST',{token:query.get('reset_token'),password});history.replaceState({},'','/');setMode('login');setNote('密碼已更新，請重新登入。')}
  }catch(e){setNote(errorText(e))}finally{setBusy(false)}}
  return <main className="r2-auth"><div className="r2-brand">S</div><small>SOCRATES · 共思教室</small><h1>從一個問題，<br/>看見自己的原則。</h1><p className="muted">表達、追問、相遇。每個觀點都有自己的位置。</p>
    <form onSubmit={e=>{e.preventDefault();void submit()}} className="r2-glass">
      <h2>{{login:'歡迎回來',register:'建立帳號',forgot:'重設登入密碼',reset:'設定新密碼'}[mode]}</h2>
      {(mode==='login'||mode==='register')&&<label>{mode==='login'?'使用者名稱或 Email':'使用者名稱'}<input autoComplete="username" required value={name} onChange={e=>setName(e.target.value)}/></label>}
      {(mode==='register'||mode==='forgot')&&<label>Email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)}/></label>}
      {mode!=='forgot'&&<label>密碼<input type="password" minLength={mode==='login'?1:12} autoComplete={mode==='login'?'current-password':'new-password'} required value={password} onChange={e=>setPassword(e.target.value)}/></label>}
      <button disabled={busy}>{busy?'處理中…':'繼續'}</button><p role="status">{note}</p>
      <div className="r2-row"><button type="button" className="quiet" onClick={()=>setMode(mode==='register'?'login':'register')}>{mode==='register'?'回到登入':'註冊'}</button><button type="button" className="quiet" onClick={()=>setMode('forgot')}>重設密碼</button></div>
    </form></main>
}
function Home({user}:{user:Account}) {
  const [mode,setMode]=useState<'teacher'|'student'>('student'),[scripts,setScripts]=useState<ScriptRow[]>([])
  const [rooms,setRooms]=useState<{id:string;title:string;phase:string;teacher:boolean}[]>([])
  const [editing,setEditing]=useState<ScriptRow|null|undefined>(),[code,setCode]=useState(''),[alias,setAlias]=useState('')
  const [note,setNote]=useState('')
  const refresh=useCallback(()=>{void api<ScriptRow[]>('/scripts').then(setScripts).catch(e=>setNote(errorText(e)));void api<typeof rooms>('/classrooms').then(setRooms).catch(e=>setNote(errorText(e)))},[])
  useEffect(refresh,[refresh])
  const enter=(id:string,role:string)=>{location.href=`/classrooms/${id}?mode=${role}`}
  async function join(){try{const r=await api<Room>('/classrooms/join','POST',{code,alias:alias||user.username,avatar:'scholar'});enter(r.id,'student')}catch(e){setNote(errorText(e))}}
  return <main className="r2-home"><header className="r2-top"><a href="/" className="r2-wordmark">Socrates<span>共思教室</span></a><span>{user.username} · {user.points} 點</span><button className="quiet" onClick={()=>void api('/auth/logout','POST').then(()=>location.reload())}>登出</button></header>
    <section className="r2-home-hero"><small>每一種立場，都值得被理解</small><h1>今天，換個角度思考。</h1><div className="r2-tabs"><button aria-pressed={mode==='student'} onClick={()=>setMode('student')}>學生入口</button><button aria-pressed={mode==='teacher'} onClick={()=>setMode('teacher')}>教師工作室</button></div></section>
    {!user.verified&&<section className="r2-card"><h2>完成 Email 驗證</h2><p>驗證後即可建立與加入教室。</p><button onClick={()=>void api('/auth/verification-email','POST',{email:user.email}).then(()=>setNote('驗證信已排入寄送。'))}>寄送驗證信</button></section>}
    {mode==='student'?<section className="r2-join r2-glass"><small>JOIN A CLASSROOM</small><h2>找到你的座位</h2><label>課程代碼<input value={code} placeholder="輸入 8 碼課程代碼" onChange={e=>setCode(e.target.value.toUpperCase())}/></label><label>本次匿名名稱<input value={alias} placeholder="你希望同學怎麼稱呼你？" onChange={e=>setAlias(e.target.value)}/></label><button onClick={()=>void join()}>進入教室 →</button></section>:
      <><div className="r2-section-title"><h2>我的劇本</h2><button onClick={()=>setEditing(null)}>＋ 建立劇本</button></div><div className="r2-script-grid">{scripts.map(s=><article key={s.id} className="r2-card"><small>草稿 v{s.revision} · {s.document.mode}</small><h3>{s.document.title}</h3><p>{s.document.questions.length} 道已編輯題目</p><div className="r2-row"><button className="quiet" onClick={()=>setEditing(s)}>編輯</button><button onClick={()=>void api<Room>('/classrooms','POST',{script_id:s.id}).then(r=>enter(r.id,'teacher')).catch(e=>setNote(errorText(e)))}>開教室</button></div></article>)}</div>
      {editing!==undefined&&<ScriptBuilder key={editing?.id||'new'} initial={editing||undefined} onSaved={refresh}/>}</>}
    <p role="status">{note}</p><section><h2>近期教室</h2><div className="r2-script-grid">{rooms.map(r=><button className="r2-card" key={r.id} onClick={()=>enter(r.id,r.teacher?mode:'student')}><strong>{r.title}</strong><span>{r.phase}</span></button>)}</div></section><footer>Run2 · <a href="/round1">單人 Round1</a> · 外觀商店列於 Run3</footer></main>
}
function useRoom(id:string,mode:string){
  const [room,setRoom]=useState<Room|null>(null),[note,setNote]=useState(''),[buffer,setBuffer]=useState('')
  const [barrage,setBarrage]=useState<{id:string;text:string}[]>([])
  const offset=useRef(0),bestRTT=useRef(Infinity),seq=useRef(0),generation=useRef(''),textBuffer=useRef('')
  const refresh=useCallback(async()=>{try{const r=await api<Room>(`/classrooms/${id}?mode=${mode}`);if(r.seq>=seq.current){seq.current=r.seq;setRoom(r)}return r}catch(e){setNote(errorText(e));return null}},[id,mode])
  useEffect(()=>{let stopped=false,ws:WebSocket|undefined,backoff=500,refreshTimer:number|undefined
    void refresh()
    const reconnect=()=>{if(stopped)return;ws=new WebSocket(`${location.protocol==='https:'?'wss':'ws'}://${location.host}/api/v2/classrooms/${id}/ws?mode=${mode}&last_seq=${seq.current}`)
      ws.onopen=()=>{backoff=500;ws?.send(JSON.stringify({type:'ping',sent_at:Date.now()}))}
      ws.onmessage=event=>{const e=JSON.parse(event.data)
        if(e.type==='snapshot'){seq.current=e.seq;setRoom(e.room);return}
        if(e.type==='pong'){const received=Date.now(),sent=Number(e.echo),rtt=received-sent;if(rtt<bestRTT.current){bestRTT.current=rtt;offset.current=e.server_now*1000-(received+sent)/2}return}
        if(e.type==='tutor.buffer'){generation.current=e.generation_id;textBuffer.current=e.text;setBuffer(e.text);return}
        if(e.type==='tutor.delta'){
          if(generation.current!==e.generation_id){generation.current=e.generation_id;textBuffer.current=''}
          if(e.offset<=textBuffer.current.length){const t=textBuffer.current.slice(0,e.offset)+e.text;if(t.length>textBuffer.current.length){textBuffer.current=t;setBuffer(t)}}return}
        if(e.seq&&e.seq<=seq.current)return
        if(e.seq)seq.current=e.seq
        if(e.type==='barrage'){const item={id:crypto.randomUUID(),text:e.payload.text};setBarrage(x=>[...x.slice(-12),item]);window.setTimeout(()=>setBarrage(x=>x.filter(b=>b.id!==item.id)),7000)}
        if(e.type==='tutor.final'){textBuffer.current='';setBuffer('')}
        if(e.type==='answer.closing')window.dispatchEvent(new Event('r2-final-sync'))
        if(refreshTimer===undefined)refreshTimer=window.setTimeout(()=>{refreshTimer=undefined;void refresh()},16)
      }
      ws.onclose=()=>{if(!stopped){window.setTimeout(reconnect,backoff);backoff=Math.min(5000,backoff*2)}}
    };reconnect()
    const ping=window.setInterval(()=>{if(ws?.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'ping',sent_at:Date.now()}))},5000)
    const poll=window.setInterval(()=>void refresh(),3000)
    return ()=>{stopped=true;ws?.close();clearInterval(ping);clearInterval(poll);if(refreshTimer)clearTimeout(refreshTimer)}
  },[id,mode,refresh])
  return {room,note,setNote,refresh,buffer,barrage,offset}
}
function Clock({deadline,offset}:{deadline:number|null;offset:React.MutableRefObject<number>}){
  const [seconds,setSeconds]=useState(0)
  useEffect(()=>{let frame=0;const render=()=>{setSeconds(deadline?Math.max(0,deadline-(Date.now()+offset.current)/1000):0);frame=requestAnimationFrame(render)};render();return()=>cancelAnimationFrame(frame)},[deadline,offset])
  return deadline?<div className="r2-clock" aria-label="全教室倒數">{Math.ceil(seconds)}<small>秒</small></div>:null
}
function AnswerPanel({room,refresh,setNote,offset}:{room:Room;refresh:()=>Promise<Room|null>;setNote:(s:string)=>void;offset:React.MutableRefObject<number>}){
  const initial=room.my_draft as {option_id?:string;text?:string;revision?:number}|null
  const [choice,setChoice]=useState(initial?.option_id||''),[text,setText]=useState(initial?.text||''),[writing,setWriting]=useState(!!initial?.option_id)
  const revision=useRef(initial?.revision||0),sent=useRef(false),finalAction=useRef(crypto.randomUUID())
  const latest=useRef({choice,text});latest.current={choice,text}
  const allowed=room.available_actions.includes('answer')
  const submit=useCallback(async()=>{const v=latest.current;if(sent.current||!v.choice)return;sent.current=true;try{await command(room.id,'answer',{question_run_id:room.question_run_id,option_id:v.choice,text:v.text,revision:++revision.current},finalAction.current);await refresh()}catch(e){sent.current=false;setNote(errorText(e));await refresh()}},[room.id,room.question_run_id,refresh,setNote])
  useEffect(()=>{if(!choice||!allowed)return;const v=++revision.current;const timer=setTimeout(()=>void command(room.id,'draft',{question_run_id:room.question_run_id,option_id:choice,text,revision:v}).catch(e=>setNote(errorText(e))),350);return()=>clearTimeout(timer)},[choice,text,allowed,room.id,room.question_run_id,setNote])
  useEffect(()=>{const flush=()=>void submit();window.addEventListener('r2-final-sync',flush);const timer=setTimeout(flush,Math.max(0,(room.deadline_at||0)*1000-(Date.now()+offset.current)));return()=>{window.removeEventListener('r2-final-sync',flush);clearTimeout(timer)}},[room.deadline_at,submit,offset])
  if(!allowed)return <section className="r2-dialog"><small>ANSWER RECORDED</small><h2>你的觀點，已經有了位置。</h2><p>等待大家完成作答，接著一起看看各種立場。</p></section>
  return <section className="r2-answer"><article className="r2-prompt"><small>情境 {room.question_index+1} / {room.question_count}</small><h1>{room.question?.title}</h1><p>{room.question?.scenario}</p></article>
    {!writing?<div className="r2-options">{room.question?.options.map((o,i)=><button key={o.id} className={'r2-option '+(choice===o.id?'chosen':'')} onClick={()=>{setChoice(o.id);setWriting(true)}}><small>{String.fromCharCode(65+i)}</small>{o.text}</button>)}</div>:
    <div className="r2-dialog r2-expand"><button className="quiet" onClick={()=>setWriting(false)}>← 返回選項，保留草稿</button><small>你的選擇 · {room.question?.options.find(o=>o.id===choice)?.text}</small><DraftComposer value={text} onChange={setText} onSend={submit} enabled={allowed} canSend={Boolean(choice)&&(!room.question?.argument_required||Boolean(text.trim()))} label="說說你選擇的理由" placeholder="我這樣想，是因為…" autoFocus/></div>}
  </section>
}
function SummaryText({value}:{value:Summary|undefined}){
  const [shown,setShown]=useState('')
  useEffect(()=>{const chars=Array.from(value?.text||'');let count=0;setShown('');
    if(window.matchMedia('(prefers-reduced-motion: reduce)').matches){setShown(chars.join(''));return}
    const timer=window.setInterval(()=>{count=Math.min(chars.length,count+3);setShown(chars.slice(0,count).join(''));if(count===chars.length)clearInterval(timer)},25)
    return ()=>clearInterval(timer)
  },[value?.text])
  return value?.status==='READY'?<><p className="r2-reveal">{shown}</p>{value.key_points?.map((x,i)=><p key={i} className="r2-keypoint">{x}</p>)}</>:<div className="r2-pending"><span className="r2-pulse"/>稍後再產生，額度恢復後會更新。</div>
}
function SummaryPanel({room,refresh}:{room:Room;refresh:()=>Promise<Room|null>}){
  const [open,setOpen]=useState<number|null>(null)
  const summaries=room.summaries as {questions:Record<string,Summary>;class:Summary;personal:Record<string,Summary>;statistics:Statistics[];records?:unknown[]}
  const stats=summaries.statistics||[]
  const personal=room.member_id?summaries.personal[room.member_id]:undefined
  useEffect(()=>{if(room.member_id&&personal?.status==='NOT_REQUESTED')void command(room.id,'personal_summary').then(refresh)},[room.id,room.member_id,personal?.status,refresh])
  useEffect(()=>{if(open===null)return;const prior=document.body.style.overflow;document.body.style.overflow='hidden';const onKey=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(null)};window.addEventListener('keydown',onKey);return()=>{document.body.style.overflow=prior;window.removeEventListener('keydown',onKey)}},[open])
  useEffect(()=>{if(open!==null&&room.member_id&&!summaries.personal[room.member_id+':'+open])void command(room.id,'personal_summary',{question_index:open}).then(refresh)},[open,room.id,room.member_id,summaries.personal,refresh])
  const card=(s:Statistics)=><><small>QUESTION {s.index+1}</small><h2>{s.title}</h2><div className="r2-bars">{s.distribution.map((d,i)=><div key={i}><div className="r2-row"><span>{d.text}</span><b>{d.count} 人 · {d.percent.toFixed(1)}%</b></div><div className="r2-bar"><i style={{width:d.percent+'%'}}/></div></div>)}</div><h3>全班的思考</h3><SummaryText value={summaries.questions[String(s.index)]}/><h3>我的思考</h3><SummaryText value={room.member_id?summaries.personal[room.member_id+':'+s.index]:undefined}/></>
  return <section className="r2-summary"><small>THE MIRROR · 課堂回顧</small><h1>照見你帶來的原則。</h1><div className="r2-card"><h2>全課總結</h2><SummaryText value={summaries.class}/></div><div className="r2-script-grid">{stats.map(s=><article className="r2-card" key={s.index}><button className="r2-summary-card" onClick={()=>setOpen(s.index)}><small>情境 {s.index+1}</small><h2>{s.title}</h2><span>展開深度回顧 ↗</span></button></article>)}</div>
    {room.role==='teacher'&&<details className="r2-card"><summary>教師完整分析與紀錄</summary><pre>{JSON.stringify(summaries.records,null,2)}</pre></details>}
    {open!==null&&<div className="r2-zen-backdrop" onClick={()=>setOpen(null)}><article role="dialog" aria-modal="true" aria-label="單題深度回顧" className="r2-zen" onClick={e=>e.stopPropagation()}><button autoFocus className="r2-zen-close" onClick={()=>setOpen(null)}>關閉 ×</button>{stats.find(s=>s.index===open)&&card(stats.find(s=>s.index===open)!)}</article></div>}
  </section>
}
function Classroom({user,id}:{user:Account;id:string}) {
  const mode=new URLSearchParams(location.search).get('mode')||'student'
  const {room,note,setNote,refresh,buffer,barrage,offset}=useRoom(id,mode)
  const [left,setLeft]=useState(false),[right,setRight]=useState(false),[menu,setMenu]=useState(false),[text,setText]=useState('')
  const [alias,setAlias]=useState(user.username)
  const f=room?.focus as unknown as Focus|null
  const selected=!!room?.member_id&&f?.member_id===room.member_id&&mode==='student'
  const run=(kind:Parameters<typeof command>[1],data:Record<string,unknown>={})=>command(id,kind,data).then(async()=>{await refresh();return true}).catch(e=>{setNote(errorText(e));return false})
  if(!room)return <main className="r2-loading"><div className="r2-pulse"/><h2>正在進入教室</h2><p>{note}</p><a href="/">首頁</a></main>
  return <main className="r2-classroom"><header className="r2-top"><button className="quiet" aria-label="展開教室側欄" onClick={()=>setLeft(!left)}>☷</button><a className="r2-wordmark" href="/">Socrates</a><span>{room.title}</span><Clock deadline={room.deadline_at} offset={offset}/><button className="r2-hamburger" aria-label="三槓選單" onClick={()=>setMenu(!menu)}>☰</button>{menu&&<nav className="r2-menu"><button onClick={()=>{setLeft(!left);setMenu(false)}}>教室成員</button><button onClick={()=>{setRight(!right);setMenu(false)}}>完整對話</button><a href="/">回首頁</a>{room.role==='teacher'&&room.code&&<button onClick={()=>{location.href=`/classrooms/${id}?mode=student`}}>以學生視角加入</button>}</nav>}</header>
    {left&&<aside className="r2-drawer left"><button className="quiet" onClick={()=>setLeft(false)}>收合 ←</button><h2>同一個教室</h2><p>{room.members.length} 位學生</p>{room.members.map(m=><div className="r2-member" key={m.id}><span className="r2-seat-avatar">{m.alias.slice(0,1)}</span><span>{m.alias}{m.username&&<small> @{m.username}</small>}<small>{m.points} 點 · {m.online?'在線':'離席'}</small></span></div>)}</aside>}
    {right&&<aside className="r2-drawer right"><button className="quiet" onClick={()=>setRight(false)}>收合 →</button><h2>本題對話</h2>{(room.transcript as unknown as Focus[]).map(x=><div key={x.id}>{x.messages.map((m,i)=><article className={'r2-message '+m.role} key={i}><small>{m.role==='tutor'?'導師':'同學'}</small><p>{m.text}</p></article>)}</div>)}</aside>}
    {room.phase==='lobby'&&<section className="r2-lobby"><small>WELCOME TO THE CLASSROOM</small><h1>觀點在此相遇。</h1><div className="r2-code-display">{room.code}</div><p>分享課程代碼，邀請同學入座。</p><div className="r2-seat-grid">{room.members.map(m=><div key={m.id}><span className="r2-seat-avatar">{m.alias.slice(0,1)}</span>{m.alias}</div>)}</div>{room.role==='teacher'?<button onClick={()=>void run('start')}>開始課堂 →</button>:room.member_id?<p>已入座，等待老師開始。</p>:<div className="r2-row"><input value={alias} onChange={e=>setAlias(e.target.value)} aria-label="匿名名稱"/><button onClick={()=>void api('/classrooms/join','POST',{code:room.code,alias,avatar:'scholar'}).then(refresh).catch(e=>setNote(errorText(e)))}>以學生身份入座</button></div>}</section>}
    {room.phase==='countdown'&&<section className="r2-countdown"><small>讓我們開始思考</small><Clock deadline={room.deadline_at} offset={offset}/></section>}
    {room.phase==='answering'&&(room.role==='teacher'?<section className="r2-lobby"><small>QUESTION {room.question_index+1}</small><h1>{room.question?.title}</h1><p>{room.question?.scenario}</p><p>學員正在作答，倒數由伺服器同步。</p></section>:<AnswerPanel key={room.question_run_id} room={room} refresh={refresh} setNote={setNote} offset={offset}/>)}
    {room.phase==='distribution'&&<section className="r2-distribution"><small>OUR PERSPECTIVES</small><h1>同一個問題，不同的看法。</h1>{room.distribution.map((raw,i)=>{const d=raw as {text:string;percent:number;count:number;members:{alias:string;avatar:string}[]};return <article className="r2-card" key={i}><h2>{d.text}</h2><b>{d.percent.toFixed(1)}% · {d.count} 人</b><div className="r2-bar"><i style={{width:d.percent+'%'}}/></div><div className="r2-row">{d.members?.map((m,j)=><span className="r2-mini-person" key={j}><i>{m.alias.slice(0,1)}</i>{m.alias}</span>)}</div></article>})}</section>}
    {['arena','focus','focus_summary'].includes(room.phase)&&<><Arena room={room}/><div className="r2-barrage-layer">{barrage.map((b,i)=><span key={b.id} style={{top:(12+(i%6)*10)+'%'}}>{b.text}</span>)}</div>
      {selected&&<aside className="r2-focus-chat"><small>你的深入討論</small>{f?.messages.map((m,i)=><article className={'r2-message '+m.role} key={i}><small>{m.role==='tutor'?'導師':'你'}</small><p>{m.text}</p></article>)}</aside>}
      <section className="r2-live-dialog"><small>{room.source_mode==='openrouter'?'LIVE TUTOR':'SCRIPTED PROBE'} · {selected?'導師正與你對話':'一起聽聽這個觀點'}</small><p>{buffer||f?.messages.filter(m=>m.role==='tutor').at(-1)?.text||'導師正在整理問題…'}</p>{room.phase==='focus_summary'&&<p>{f?.micro_summary}</p>}
        {room.role==='student'&&<><DraftComposer value={text} onChange={setText} label={selected?'回覆導師':'匿名彈幕'} enabled={!selected||room.available_actions.includes('focus_message')} placeholder={selected?'說說你現在的想法…':'分享一則匿名彈幕…'} onSend={async()=>{if(text.trim()){const ok=await run(selected?'focus_message':'barrage',{text});if(ok)setText('')}}}/><div className="r2-row">{f&&!selected&&(['heart','like','gift'] as const).map((kind,i)=><button className="r2-reaction" key={kind} aria-label={kind} onClick={()=>void api(`/classrooms/${id}/reactions`,'POST',{action_id:crypto.randomUUID(),kind,focus_id:f.id,turn_index:f.turn_index}).catch(e=>setNote(errorText(e)))}>{['♡','讚','◇'][i]}</button>)}</div></>}
      </section></>}
    {room.phase==='question_summary'&&<section className="r2-lobby"><div className="r2-pulse"/><h1>正在醞釀下一個問題。</h1><p>本題討論已保存。模型可用時，課堂會自動接續。</p></section>}
    {room.phase==='preview'&&<section className="r2-lobby"><small>NEXT QUESTION</small><h1>{room.preview?.title||'下一個思考，即將展開。'}</h1><p>{room.preview?.scenario}</p>{room.role==='teacher'&&<div className="r2-row"><button onClick={()=>void run('approve_question')}>採用題目</button><button className="quiet" onClick={()=>void run('regenerate_question')}>重新生成</button></div>}</section>}
    {room.phase==='summary'&&<SummaryPanel room={room} refresh={refresh}/>}
    {room.available_actions.includes('next')&&<button className="r2-teacher-next" onClick={()=>void run('next')}>教師：下一步 →</button>}
    {note&&<div role="status" className="r2-toast" onClick={()=>setNote('')}>{note}</div>}
  </main>
}
export default function Run2App(){
  const [user,setUser]=useState<Account|null>(null),[ready,setReady]=useState(false)
  useEffect(()=>{void api<Account>('/auth/me').then(a=>{setCSRF(a.csrf_token);setUser(a)}).catch(()=>undefined).finally(()=>setReady(true))},[])
  if(!ready)return <main className="r2-loading"><div className="r2-pulse"/></main>
  if(!user||new URLSearchParams(location.search).has('reset_token')||new URLSearchParams(location.search).has('verify_token'))return <Auth onLogin={a=>{setUser(a);history.replaceState({},'','/')}}/>
  const room=location.pathname.match(/^\/classrooms\/([\w-]+)/)
  return room?<Classroom user={user} id={room[1]}/>:<Home user={user}/>
}
