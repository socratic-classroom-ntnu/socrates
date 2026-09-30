/** Capability resolution and audio-clock viseme projection; pure and testable. */
export const VISEMES = ['sil','PP','FF','TH','DD','kk','CH','SS','nn','RR','aa','E','ih','oh','ou'];
export const AZURE_MAP = ['sil','aa','aa','oh','E','RR','ih','ou','oh','aa','oh','aa','kk','RR','nn','SS','CH','TH','FF','DD','kk','PP'];
export function safeLocalUrl(value, origin = 'http://localhost') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) throw Error('LOCAL_ASSET_PATH_REQUIRED');
  const url = new URL(value, origin);
  if (url.origin !== origin || url.username || url.password || url.search || url.hash) throw Error('SAME_ORIGIN_ASSET_REQUIRED');
  return url.pathname;
}
export function validatePack(pack) {
  if (!pack || pack.schema !== 'portal/avatar-pack/v1' || !/^[A-Za-z0-9._-]{1,120}$/.test(pack.id)) throw Error('PACK_IDENTITY_REQUIRED');
  if (!Array.isArray(pack.capabilities) || !Array.isArray(pack.clips)) throw Error('PACK_CAPABILITIES_REQUIRED');
  const modelPath=safeLocalUrl(pack.model_url);
  if (!modelPath.startsWith('/avatar-packs/') || !modelPath.endsWith('.glb')) throw Error('CATALOG_MODEL_PATH_REQUIRED');
  if (!/^[a-f0-9]{64}$/.test(pack.model_sha256)) throw Error('MODEL_DIGEST_REQUIRED');
  const mode = pack.talk_mode;
  if (!['viseme','audio-reactive','audio-only'].includes(mode)) throw Error('TALK_MODE_REQUIRED');
  if (mode === 'viseme') for(const key of VISEMES.slice(1)) {
    const mapping=pack.viseme_map?.[key];
    if (!mapping || !Object.keys(mapping).length || Object.values(mapping).some(x=>!Number.isFinite(x)||x<0||x>1)) throw Error('MEANINGFUL_VISEME_MAP_REQUIRED:'+key);
  }
  for(const map of Object.values(pack.expression_map||{})) {
    if(!map || typeof map!=='object' || Object.values(map).some(x=>!Number.isFinite(x)||x<0||x>1))throw Error('BOUNDED_EXPRESSION_MAP_REQUIRED');
  }
  return pack;
}
export function timeline(events, durationMs) {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw Error('AUDIO_DURATION_REQUIRED');
  const aliases={I:'ih',O:'oh',U:'ou'};
  const rows=(events||[]).map((e,i)=>({viseme:VISEMES.includes(e.viseme)?e.viseme:aliases[e.viseme]??AZURE_MAP[e.visemeId??e.id]??'sil',
    at: e.timeMs ?? e.audioOffsetMs ?? ((e.audioOffset??e.offsetTicks) !== undefined?(e.audioOffset??e.offsetTicks)/10000:NaN), i}));
  if(rows.some(x=>!Number.isFinite(x.at)||x.at<0||x.at>durationMs))throw Error('BOUNDED_AUDIO_OFFSETS_REQUIRED');
  rows.sort((a,b)=>a.at-b.at||a.i-b.i);
  return [{viseme:'sil',at:0},...rows,{viseme:'sil',at:durationMs}];
}
export function weightsAt(pack, frames, elapsedMs) {
  if(elapsedMs<0 || !frames.length || elapsedMs>=frames.at(-1).at)return {};
  let i=0;while(i+1<frames.length && frames[i+1].at<=elapsedMs)i++;
  const current=frames[i], next=frames[i+1];
  const base=pack.viseme_map?.[current.viseme]||{};
  if(!next)return {...base};
  const blend=Math.max(0,Math.min(1,(elapsedMs-(next.at-35))/35));
  const after=pack.viseme_map?.[next.viseme]||{};
  return Object.fromEntries([...new Set([...Object.keys(base),...Object.keys(after)])].map(k=>[k,(base[k]||0)*(1-blend)+(after[k]||0)*blend]));
}
export class AudioLane {
  constructor(contextFactory=()=>new (window.AudioContext||window.webkitAudioContext)()) {this.factory=contextFactory;this.context=null;this.current=null;this.generation=0;}
  async play(buffer,onFrame=()=>{}) {
    this.stop();const generation=++this.generation;this.context??=this.factory();
    await this.context.resume();if(generation!==this.generation)return {state:'SUPERSEDED'};
    const source=this.context.createBufferSource();source.buffer=buffer;source.connect(this.context.destination);
    const started=this.context.currentTime;let raf=0;
    return new Promise((resolve,reject)=>{
      let settled=false;const finish=(state)=>{if(settled)return;settled=true;cancelAnimationFrame(raf);source.disconnect();if(this.current?.source===source)this.current=null;onFrame(buffer.duration*1000,true);resolve({state});};
      this.current={source,finish};source.onended=()=>finish('ENDED');
      const render=()=>{if(generation!==this.generation)return;onFrame(Math.max(0,(this.context.currentTime-started)*1000),false);raf=requestAnimationFrame(render)};
      try{source.start();render()}catch(error){
        if(!settled){settled=true;cancelAnimationFrame(raf);source.disconnect();if(this.current?.source===source)this.current=null;onFrame(buffer.duration*1000,true);reject(error)}
      }
    });
  }
  stop(){this.generation++;if(this.current){const old=this.current;this.current=null;old.finish('STOPPED');try{old.source.stop()}catch{}}}
  async dispose(){this.stop();await this.context?.close();this.context=null}
}
