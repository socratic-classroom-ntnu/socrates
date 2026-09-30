import axios from 'axios'
import { getLearnerId } from '../identity'
// Axios request/response API carried over window.fetch: the pre-R80 client and its resident tests observe fetch(url, init).
function fetchAdapter(credentials){return async config=>{
 const headers={};for(const [k,v] of Object.entries(axios.AxiosHeaders.from(config.headers).toJSON())){if(v!==undefined&&v!==null&&v!==false)headers[k]=String(v)}
 const init={method:(config.method||'get').toUpperCase(),headers,credentials}
 if(config.data!==undefined&&config.data!==null)init.body=config.data
 if(config.signal)init.signal=config.signal
 const res=await fetch(axios.getUri(config),init)
 let data=null
 if(config.responseType==='text'&&typeof res.text==='function')data=await res.text()
 else{try{data=await res.json()}catch{data=null}}
 const response={data,status:res.status,statusText:res.statusText||'',headers:{},config,request:null}
 if(!res.ok)throw new axios.AxiosError('Request failed with status code '+res.status,res.status>=500?axios.AxiosError.ERR_BAD_RESPONSE:axios.AxiosError.ERR_BAD_REQUEST,config,null,response)
 return response}}
export class ApiError extends Error{constructor(status,detail){super(`API ${status}`);this.name='ApiError';this.status=status;this.detail=detail
 // Home resumes the learner's open session from a 409 active_session_exists conflict.
 const d=detail&&detail.detail;this.activeSessionId=status===409&&d&&d.code==='active_session_exists'&&typeof d.session_id==='string'?d.session_id:undefined}}
const client=axios.create({baseURL:'/api',adapter:fetchAdapter('same-origin'),headers:{'Content-Type':'application/json'}})
client.interceptors.request.use(config=>{config.headers=config.headers||{};config.headers['X-Learner-Id']=getLearnerId();return config})
client.interceptors.response.use(r=>r,err=>Promise.reject(new ApiError(err.response?.status||0,err.response?.data)))
async function request(path,config={}){const response=await client.request({url:path,...config});return response.data}
export const createSession=(ladderId,restartExisting=false)=>request('/sessions',{method:'POST',data:{ladder_id:ladderId,restart_existing:restartExisting}})
export const listSessions=cursor=>{const params={limit:30,...(cursor?{cursor}:{})};return request('/sessions',{params})}
export const getSession=id=>request(`/sessions/${id}`)
export const sendMessage=(id,text)=>request(`/sessions/${id}/messages`,{method:'POST',data:{text}})
export const advanceSession=id=>request(`/sessions/${id}/advance`,{method:'POST'})
export const retry=id=>request(`/sessions/${id}/retry`,{method:'POST'})
export const endSession=id=>request(`/sessions/${id}/end`,{method:'POST'})
export const createSummary=id=>request(`/sessions/${id}/summary`,{method:'POST'})
export const getSummary=id=>request(`/sessions/${id}/summary`)
export const getRelease=()=>request('/release')
