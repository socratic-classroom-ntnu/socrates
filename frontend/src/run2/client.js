import axios from 'axios'
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

let csrf=''
export function setCSRF(value){csrf=value||''}
export class ApiError extends Error{constructor(status,detail){super(typeof detail==='string'?detail:`API ${status}`);this.name='ApiError';this.status=status;this.detail=detail}}
export const http=axios.create({baseURL:'/api/v2',adapter:fetchAdapter('same-origin'),headers:{'Content-Type':'application/json'}})
http.interceptors.request.use(config=>{const method=(config.method||'get').toLowerCase();if(!['get','head','options'].includes(method)&&csrf){config.headers=config.headers||{};config.headers['X-CSRF-Token']=csrf}return config})
http.interceptors.response.use(r=>r,err=>{const status=err.response?.status||0;const detail=err.response?.data?.detail??err.response?.data??err.message;return Promise.reject(new ApiError(status,detail))})
export async function api(path,method='GET',body){const response=await http.request({url:path,method,data:body,signal:body?.signal});return response.data}
export function command(room,kind,data={},actionId=crypto.randomUUID()){return api(`/classrooms/${room}/commands`,'POST',{kind,data,action_id:actionId})}
export async function importYAML(text){const response=await http.post('/scripts/import',text,{headers:{'Content-Type':'application/yaml'}});return response.data}
export async function exportYAML(id){const response=await http.get(`/scripts/${id}/yaml`,{responseType:'text'});return response.data}
