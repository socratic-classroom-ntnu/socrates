import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { DraftComposer, transcriptText } from './DraftComposer'

function Harness({onSend=jest.fn()}: {onSend?: () => void | Promise<unknown>}) {
  const [value,setValue]=useState('原始內容')
  return <DraftComposer value={value} onChange={setValue} onSend={onSend}/>
}

test('麥克風在左，文字在中，Enter 在右',()=>{
  const {container}=render(<Harness/>)
  const row=container.querySelector('.socratic-composer-row')!
  expect(row.children[0]).toHaveAttribute('aria-label','開始語音輸入')
  expect(row.children[row.children.length-1]).toHaveAttribute('aria-label','傳送')
  expect(screen.getByRole('textbox',{name:'文字輸入'})).toHaveValue('原始內容')
})
test('interim 與 final 替換同一段文字，保留手動輸入',()=>{
  const interim={results:{length:1,0:{isFinal:false,0:{transcript:'立'}}}}
  const final={results:{length:1,0:{isFinal:true,0:{transcript:'立場',confidence:.8}}}}
  expect(transcriptText('原始內容',interim).text).toBe('原始內容 立')
  expect(transcriptText('原始內容',final)).toEqual({text:'原始內容 立場',confidence:.8,final:true})
})
test('中文選字與 Shift Enter 保留輸入；一般 Enter 送出一次',async()=>{
  const send=jest.fn();render(<Harness onSend={send}/>)
  const box=screen.getByRole('textbox')
  fireEvent.keyDown(box,{key:'Enter',isComposing:true,keyCode:229})
  fireEvent.keyDown(box,{key:'Enter',shiftKey:true})
  expect(send).toHaveBeenCalledTimes(0)
  await act(async()=>{fireEvent.keyDown(box,{key:'Enter'})})
  expect(send).toHaveBeenCalledTimes(1)
})
test('pending send 持有單一 effect',async()=>{
  let resolve:()=>void=()=>undefined
  const send=jest.fn(()=>new Promise<void>(r=>{resolve=r}))
  render(<Harness onSend={send}/>)
  fireEvent.click(screen.getByRole('button',{name:'傳送'}))
  fireEvent.keyDown(screen.getByRole('textbox'),{key:'Enter'})
  expect(send).toHaveBeenCalledTimes(1)
  await act(async()=>{resolve()})
})
test('麥克風逐字輸入最後停回文字框',async()=>{
  let current:{onresult?: (e:unknown)=>void;onend?:()=>void}|undefined
  function register(r:{onresult?: (e:unknown)=>void;onend?:()=>void}){current=r}
  class SpeechMock {lang='';continuous=false;interimResults=false;onresult=undefined;onend=undefined;onerror=undefined;start(){register(this)}stop(){}abort(){}}
  Object.defineProperty(window,'SpeechRecognition',{configurable:true,writable:true,value:SpeechMock})
  render(<Harness/>)
  fireEvent.click(screen.getByRole('button',{name:'開始語音輸入'}))
  await act(async()=>{current?.onresult?.({results:{length:1,0:{isFinal:true,0:{transcript:'因為值得'}}}})})
  expect(screen.getByRole('textbox')).toHaveValue('原始內容 因為值得')
  fireEvent.click(screen.getByRole('button',{name:'停止語音輸入'}))
  expect(screen.getByRole('textbox')).toHaveValue('原始內容 因為值得')
  Object.defineProperty(window,'SpeechRecognition',{configurable:true,writable:true,value:undefined})
})
