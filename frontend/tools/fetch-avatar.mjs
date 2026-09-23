import fs from 'node:fs';import crypto from 'node:crypto';
const dir='public/avatars/ce-brunette',spec=JSON.parse(fs.readFileSync(dir+'/SOURCE.json','utf8'));
const hash=b=>crypto.createHash('sha1').update(Buffer.from('blob '+b.length+'\0')).update(b).digest('hex');
const path=dir+'/avatar.glb';
if(!(fs.existsSync(path)&&hash(fs.readFileSync(path))===spec.git_blob_sha)){
  let found=false;
  for(const url of [spec.url,'https://api.github.com/repos/met4citizen/TalkingHead/git/blobs/'+spec.git_blob_sha]){
    try{const r=await fetch(url,{headers:{'User-Agent':'Socrates-Run2'},signal:AbortSignal.timeout(45000)});if(!r.ok)throw Error('HTTP '+r.status);
      const b=url.includes('api.github.com')?Buffer.from((await r.json()).content,'base64'):Buffer.from(await r.arrayBuffer());
      if(hash(b)!==spec.git_blob_sha||b.subarray(0,4).toString()!=='glTF')throw Error('ASSET_IDENTITY');fs.writeFileSync(path,b);found=true;break;
    }catch(e){console.error('AVATAR_ATTEMPT',e.name)}
  }
  if(!found)throw Error('PINNED_AVATAR_SOURCE_AWAITING');
}
