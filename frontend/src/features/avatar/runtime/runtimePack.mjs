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
  cameraPreset(pack);
  return pack;
}
/**
 * 每個 pack 可在 catalog 帶 camera_preset 微調上半身取景（不分 pack ID 寫分支）：
 * zoom＝推近倍數（1＝通用取景），取景上緣固定、從下方裁掉，頭頂不會被推出畫面；
 * lift＝鏡頭與注視點一起上移，單位是通用取景可見高度的比例。
 */
export function cameraPreset(pack) {
  const preset = pack?.camera_preset ?? {};
  const zoom = preset.zoom ?? 1, lift = preset.lift ?? 0;
  if (typeof preset !== 'object' || !Number.isFinite(zoom) || zoom < 0.5 || zoom > 3 || !Number.isFinite(lift) || Math.abs(lift) > 0.5) throw Error('BOUNDED_CAMERA_PRESET_REQUIRED');
  return { zoom, lift, framing: typeof preset.framing === 'string' ? preset.framing : 'upper-body' };
}
/** 依 preset 移動鏡頭與注視點；position、target 為 {x,y,z}，halfView＝通用取景在注視點距離的可見半高。 */
export function placeCamera(position, target, preset, halfView) {
  const up = halfView * (1 - 1 / preset.zoom) + preset.lift * 2 * halfView;
  const from = ['x','y','z'].reduce((o,k)=>({...o,[k]: target[k] + (position[k]-target[k]) / preset.zoom}), {});
  return { position: { ...from, y: from.y + up }, target: { ...target, y: target.y + up } };
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
  unlock(){this.context??=this.factory();return this.context.resume();}
  async play(buffer,onFrame=()=>{}) {
    this.stop();const generation=++this.generation;this.context??=this.factory();
    return new Promise((resolve,reject)=>{
      let settled=false,raf=0;
      const current={source:null,finish:null};
      const clear=()=>{if(raf)cancelAnimationFrame(raf);current.source?.disconnect();if(this.current===current)this.current=null;onFrame(buffer.duration*1000,true);};
      const finish=(state)=>{if(settled)return;settled=true;try{clear();resolve({state})}catch(error){reject(error)}};
      const fail=(error)=>{if(settled)return;settled=true;try{clear()}catch(cleanupError){reject(cleanupError);return}reject(error)};
      current.finish=finish;this.current=current;
      let resumed;
      try{resumed=this.context.resume()}catch(error){fail(error);return;}
      Promise.resolve(resumed).then(()=>{
        if(settled)return;
        if(generation!==this.generation){finish('SUPERSEDED');return;}
        try{
          const source=this.context.createBufferSource();current.source=source;source.buffer=buffer;source.connect(this.context.destination);
          const started=this.context.currentTime;
          source.onended=()=>finish('ENDED');
          const render=()=>{if(generation!==this.generation)return;onFrame(Math.max(0,(this.context.currentTime-started)*1000),false);raf=requestAnimationFrame(render)};
          source.start();render();
        }catch(error){fail(error)}
      },fail);
    });
  }
  stop(){this.generation++;if(this.current){const old=this.current;this.current=null;old.finish('STOPPED');try{old.source?.stop()}catch{/* source already stopped */}}}
  async dispose(){this.stop();await this.context?.close();this.context=null}
}
