import {AudioLane,validatePack,timeline,weightsAt,safeLocalUrl} from './runtimePack.mjs';
/** GLB-native presenter: authored clips and actual morph targets retain their identity. */
export class PackPresenter {
  constructor(container){this.container=container;this.audio=new AudioLane();this.frame=0;this.epoch=0;this.renderer=null;this.pack=null;this.morphs=[];this.lastWeights={};this.ready=false;this.alive=true;this.speechWeights={};}
  async load(pack){
    validatePack(pack);if(!this.alive)throw Error('ACTIVE_PRESENTER_REQUIRED');const epoch=++this.epoch;this.clearModel();
    const THREE=await import('three');
    const {GLTFLoader}=await import('three/addons/loaders/GLTFLoader.js');
    const response=await fetch(safeLocalUrl(pack.model_url),{credentials:'same-origin'});if(!response.ok)throw Error('MODEL_HTTP_'+response.status);
    const bytes=await response.arrayBuffer();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!==pack.model_sha256)throw Error('MODEL_DIGEST_BINDING_REQUIRED');
    const loader=new GLTFLoader();const gltf=await loader.parseAsync(bytes,new URL(pack.model_url,location.origin).href.replace(/[^/]*$/,''));
    if(!this.alive||epoch!==this.epoch){this.release(gltf.scene);return}
    this.pack=pack;this.THREE=THREE;this.model=gltf.scene;this.scene=new THREE.Scene();this.scene.add(this.model);
    const box=new THREE.Box3().setFromObject(this.model), center=box.getCenter(new THREE.Vector3()),size=box.getSize(new THREE.Vector3());
    this.model.position.sub(center);this.originalScale=this.model.scale.clone();
    this.camera=new THREE.PerspectiveCamera(30,1,.01,1000);this.camera.position.set(0,size.y*.13,Math.max(size.y,size.x,1)*2.15);this.camera.lookAt(0,size.y*.07,0);
    this.scene.add(new THREE.HemisphereLight(0xffffff,0x554d70,2.4));const light=new THREE.DirectionalLight(0xffffff,2.2);light.position.set(2,4,3);this.scene.add(light);
    this.renderer=new THREE.WebGLRenderer({alpha:true,antialias:true});this.renderer.setPixelRatio(Math.min(2,devicePixelRatio||1));this.container.append(this.renderer.domElement);
    this.morphs=[];const real=new Set();this.model.traverse(o=>{if(o.morphTargetDictionary&&o.morphTargetInfluences){this.morphs.push(o);Object.keys(o.morphTargetDictionary).forEach(k=>real.add(k))}});
    for(const [v,map] of Object.entries(pack.viseme_map||{}))for(const key of Object.keys(map))if(!real.has(key))throw Error('MORPH_BINDING_REQUIRED:'+v+':'+key);
    this.clips=gltf.animations;this.mixer=new THREE.AnimationMixer(this.model);const idle=gltf.animations.find(a=>/idle|breath/i.test(a.name));if(idle)this.mixer.clipAction(idle).play();
    this.clock=new THREE.Clock();this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(this.container);this.fit();this.ready=true;
    const render=()=>{if(epoch!==this.epoch)return;this.mixer?.update(Math.min(this.clock.getDelta(),.1));const blinkAt=(performance.now()/1000)%4.1;const blink=blinkAt<.18?Math.sin(blinkAt/.18*Math.PI):0;const face={...this.speechWeights};for(const map of Object.values(this.pack?.expression_map||{}))for(const [key,value] of Object.entries(map))face[key]=(face[key]||0)+value*blink;this.apply(face);this.renderer?.render(this.scene,this.camera);this.frame=requestAnimationFrame(render)};render();
    this.container.dataset.packId=pack.id;this.container.dataset.modelSha=digest;this.container.dataset.talkMode=pack.talk_mode;
  }
  fit(){if(!this.renderer)return;const w=Math.max(1,this.container.clientWidth),h=Math.max(1,this.container.clientHeight);this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix()}
  apply(weights){const keys=new Set([...Object.keys(this.lastWeights),...Object.keys(weights)]);for(const m of this.morphs)for(const key of keys){const index=m.morphTargetDictionary[key];if(index!==undefined)m.morphTargetInfluences[index]=weights[key]||0}this.lastWeights=weights}
  async play(buffer,events){const pack=this.pack;let frames;try{frames=timeline(events,buffer.duration*1000);this.container.dataset.timingState='SOURCE_TIMELINE_BOUND'}catch{frames=timeline([],buffer.duration*1000);this.container.dataset.timingState='AUDIO_ONLY_TIMING_RECONCILIATION'}return this.audio.play(buffer,(ms,ended)=>{
    if(pack?.talk_mode==='viseme')this.speechWeights=ended?{}:weightsAt(pack,frames,ms);
    if(pack?.talk_mode==='audio-reactive'&&this.model){const index=Math.floor(ms/1000*buffer.sampleRate),samples=buffer.getChannelData(0);let sum=0,n=0;for(let i=index;i<Math.min(samples.length,index+512);i++){sum+=samples[i]*samples[i];n++}const level=ended?0:Math.min(.08,Math.sqrt(sum/Math.max(1,n))*.3);this.model.scale.copy(this.originalScale).multiplyScalar(1+level)}
  })}
  playClip(name){const clip=this.clips?.find(a=>a.name===name);if(!clip)throw Error('AUTHORED_CLIP_REQUIRED');this.mixer.stopAllAction();this.mixer.clipAction(clip).reset().play()}
  stop(){this.audio.stop();this.speechWeights={};this.apply({})}
  release(root){root?.traverse(o=>{o.geometry?.dispose();for(const material of (Array.isArray(o.material)?o.material:[o.material])){if(material){for(const value of Object.values(material))if(value?.isTexture)value.dispose();material.dispose()}}})}
  clearModel(){this.ready=false;cancelAnimationFrame(this.frame);this.resize?.disconnect();this.mixer?.stopAllAction();this.release(this.model);this.model=null;this.renderer?.dispose();this.renderer?.domElement.remove();this.renderer=null;this.morphs=[];this.lastWeights={}}
  async dispose(){this.alive=false;this.epoch++;this.clearModel();await this.audio.dispose()}
}
