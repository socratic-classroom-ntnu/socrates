/** Actual built frontend, isolated HTTP fixture, real Chromium screenshots. */
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';
import {createRequire} from 'node:module';
const root=path.resolve(process.argv[2]),out=path.resolve(process.argv[3]);fs.mkdirSync(out,{recursive:true});
const require=createRequire(path.join(root,'package.json'));const {chromium}=require('@playwright/test');
const dist=path.join(root,'dist');if(!fs.existsSync(path.join(dist,'index.html')))throw Error('BUILT_FRONTEND_REQUIRED');
const server=http.createServer((req,res)=>{let name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);const selected=path.resolve(dist,'.'+name);let p=selected.startsWith(dist+path.sep)&&fs.existsSync(selected)&&fs.statSync(selected).isFile()?selected:path.join(dist,'index.html');const ext=path.extname(p);res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'})[ext]||'application/octet-stream');fs.createReadStream(p).pipe(res)});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
try{
 const binary=['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(p=>fs.existsSync(p));browser=await chromium.launch({headless:true,...(binary?{executablePath:binary}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const fixture={id:'00000000-0000-4000-8000-000000000001',role:'teacher',kind:'GroupCollection',title:'隔離測試教室',phase:'lobby',code:'TEST1234',roster:[{id:'m1',alias:'同學一'},{id:'m2',alias:'同學二'}],roster_digest:'fixture',configuration:{group_count:2,members_per_group:1,avatar_pack_id:'stickman'},groups:[]};
 await page.route('**/api/v2/**',route=>{const url=new URL(route.request().url());const p=url.pathname;
   let body=p.endsWith('/auth/me')?{id:'teacher-fixture',username:'測試教師',email:'teacher@example.test',verified:true,points:0,csrf_token:'fixture'}:p.includes('/groups/classrooms/')?fixture:[];
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)})});
 const base=`http://127.0.0.1:${server.address().port}`;
 for(const query of ['','?legacy=1']){await page.goto(base+'/'+query);await page.getByRole('heading',{name:'今天，換個角度思考。'}).waitFor();if(await page.getByText('個人 × 蘇格拉底',{exact:true}).count())throw Error('CANONICAL_HOME_BOUNDARY');await page.screenshot({path:path.join(out,query?'home-legacy-query.png':'home.png'),fullPage:true})}
 await page.goto(base+`/classrooms/${fixture.id}?mode=teacher`);await page.getByText('同一個起點，各自的思考。').waitFor();await page.screenshot({path:path.join(out,'group-lobby.png'),fullPage:true});
 if(errors.length)throw Error(errors.join('\n'));
 fs.writeFileSync(path.join(out,'BROWSER-SMOKE.json'),JSON.stringify({state:'PASS',scope:'ACTUAL_BUILT_FRONTEND_WITH_HTTP_FIXTURES',checks:['canonical_home','legacy_query_same_IA','group_configuration'],live_backend:'SEPARATE_NATIVE_RUN',human_acceptance:'AWAITING_ARTHUR'},null,2));
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve))}
