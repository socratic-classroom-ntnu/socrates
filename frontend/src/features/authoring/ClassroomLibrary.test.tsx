import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ClassroomLibrary } from './ClassroomLibrary'
import { api } from '../../contract/classroomClient'
jest.mock('../../contract/classroomClient', () => ({ ...jest.requireActual('../../contract/classroomClient'), api: jest.fn() }))
jest.mock('../ai-settings/ClassroomAISettings', () => ({ ClassroomAISettings: () => <div>詳細模型參數</div> }))
jest.mock('../script-builder/ScriptBuilder', () => ({ ScriptBuilder: ({ onSaved, onDirtyChange }) => <section><h2>測試編輯器</h2><button onClick={() => onSaved({id:'new-script',revision:1})}>測試儲存</button><button onClick={() => onDirtyChange(true)}>測試編輯</button></section> }))
const script = {id:'s1', revision:2, document:{title:'科技倫理',mode:'static',questions:[{}]}}
const workspace = {id:'course1',title:'倫理思辨課',scripts:[script],lessons:[],sessions:[]}
beforeEach(() => {
 jest.mocked(api).mockReset()
 jest.mocked(api).mockImplementation(async (path) => path === '/library/classrooms' ? [{id:'course1',title:'倫理思辨課'}] : path === '/scripts' ? [script] : path === '/library/classrooms/course1' ? workspace : {id:'new-script'})
})
test('a course route has one course heading and focuses on starting a class', async () => {
 render(<ClassroomLibrary initialSelected="course1" />)
 expect(await screen.findByRole('heading',{level:1,name:'倫理思辨課'})).toBeInTheDocument()
 expect(screen.getByRole('navigation',{name:'麵包屑'})).toHaveTextContent('我的課程')
 expect(screen.getByRole('button',{name:'開課 →'})).toBeEnabled()
 expect(screen.queryByText('詳細模型參數')).toBeNull()
 expect(screen.queryByRole('button',{name:'建立教室'})).toBeNull()
})
test('advanced AI fields are separated from the question list', async () => {
 render(<ClassroomLibrary initialSelected="course1" />)
 fireEvent.click(await screen.findByRole('button',{name:'AI 設定'}))
 expect(screen.getByText('詳細模型參數').closest('details')).not.toHaveAttribute('open')
 expect(screen.queryByRole('button',{name:'開課 →'})).toBeNull()
})
test('empty history points back to preparation', async () => {
 render(<ClassroomLibrary initialSelected="course1" />)
 fireEvent.click(await screen.findByRole('button',{name:'上課紀錄'}))
 fireEvent.click(screen.getByRole('button',{name:'回到題目並開課'}))
 expect(screen.getByRole('button',{name:'開課 →'})).toBeInTheDocument()
})
test('new authoring begins in the editor, and saving attaches the created script to the course', async () => {
 render(<ClassroomLibrary initialSelected="course1" />)
 await screen.findByRole('heading',{name:'倫理思辨課'}); fireEvent.click(screen.getByRole('button',{name:'＋ 新增題目'}))
 expect(screen.getByRole('heading',{name:'測試編輯器'})).toBeInTheDocument()
 expect(jest.mocked(api).mock.calls.filter(([,method])=>method==='POST')).toHaveLength(0)
 fireEvent.click(screen.getByRole('button',{name:'測試儲存'}))
 await waitFor(()=>expect(api).toHaveBeenCalledWith('/library/classrooms/course1/scripts','POST',expect.objectContaining({script_id:'new-script',action_id:expect.any(String)})))
})
test('leaving a dirty editor asks before discarding current changes', async () => {
 const confirm = jest.spyOn(window,'confirm').mockReturnValue(false)
 render(<ClassroomLibrary initialSelected="course1" />)
 await screen.findByRole('heading',{name:'倫理思辨課'}); fireEvent.click(screen.getByRole('button',{name:'＋ 新增題目'}))
 fireEvent.click(screen.getByRole('button',{name:'測試編輯'}))
 fireEvent.click(screen.getByRole('button',{name:'← 返回題目清單'}))
 expect(confirm).toHaveBeenCalledTimes(1)
 expect(screen.getByRole('heading',{name:'測試編輯器'})).toBeInTheDocument()
 confirm.mockRestore()
})
test('personal bank reads scripts without creating a classroom', async () => {
 render(<ClassroomLibrary bankOnly />)
 expect(await screen.findByRole('heading',{name:'科技倫理'})).toBeInTheDocument()
 expect(api).not.toHaveBeenCalledWith('/library/classrooms')
 expect(screen.queryByRole('button',{name:'開課 →'})).toBeNull()
})
test('a course without scripts explains how to prepare before starting', async () => {
 jest.mocked(api).mockImplementation(async path=>path==='/library/classrooms/course1'?{...workspace,scripts:[]}:[])
 render(<ClassroomLibrary initialSelected="course1" />)
 expect(await screen.findByRole('button',{name:'開課 →'})).toBeDisabled()
 expect(screen.getByRole('button',{name:'新增第一份題目'})).toBeEnabled()
})
