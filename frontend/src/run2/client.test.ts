import {api,command,setCSRF} from './client'
afterEach(()=>jest.restoreAllMocks())
test('Run2 command carries one stable action identity and same-origin credentials',async()=>{
 const fn=jest.fn().mockResolvedValue({ok:true,json:async()=>({status:'RECORDED'})})
 globalThis.fetch=fn;setCSRF('csrf-fixture')
 await command('room','answer',{option_id:'a'},'action-fixture')
 expect(fn).toHaveBeenCalledWith('/api/v2/classrooms/room/commands',expect.objectContaining({method:'POST',credentials:'same-origin'}))
 const init=fn.mock.calls[0][1];expect(JSON.parse(init.body).action_id).toBe('action-fixture')
 expect(init.headers['X-CSRF-Token']).toBe('csrf-fixture')
})
test('Run2 API presents domain error without converting it to a successful receipt',async()=>{
 globalThis.fetch=jest.fn().mockResolvedValue({ok:false,status:409,json:async()=>({detail:'ACTION_ID_PAYLOAD_CONFLICT'})})
 await expect(api('/classrooms/r','POST',{})).rejects.toThrow('ACTION_ID_PAYLOAD_CONFLICT')
})
