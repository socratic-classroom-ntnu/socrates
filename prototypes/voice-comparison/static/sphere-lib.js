/* Shared by the native Figma builder, tests, and local preview. No dependencies. */
const LegacyV1Geometry = (() => {
  const SIZE = 280, CELLS = 12, LINK = 54;
  const COLORS = { main: '#7FB7AA', light: '#BFECE1', node: '#DDF8F1', dark: '#508C81', glow: '#D7EFE7' };
  const STATES = {
    Listening: { rho: 62, glow: .12, node: .57, energy: .035 },
    Thinking: { rho: 80, glow: .24, node: .82, energy: .18 },
    Speaking: { rho: 96, glow: .40, node: 1, energy: .30 }
  };
  function rotate([x,y,z]) {
    const a=.57,b=.48,c=.16;
    let X=x*Math.cos(a)+z*Math.sin(a), Z=-x*Math.sin(a)+z*Math.cos(a);
    let Y=y*Math.cos(b)-Z*Math.sin(b); Z=y*Math.sin(b)+Z*Math.cos(b);
    return [X*Math.cos(c)-Y*Math.sin(c),X*Math.sin(c)+Y*Math.cos(c),Z];
  }
  function point(plane, x, y) {
    const raw = plane===0 ? [x,y,0] : plane===1 ? [x,0,y] : [0,x,y];
    const [X,Y,Z]=rotate(raw);
    return { x:140+X, y:140+Y, z:Z };
  }
  function build(state) {
    const cfg=STATES[state]; if(!cfg) throw new Error('Unknown state: '+state);
    const delta=2*Math.PI/CELLS, rho=cfg.rho;
    // Exact equal-length bars in each planar annular scissor linkage.
    const h=Math.sqrt((LINK*LINK-2*rho*rho*(1-Math.cos(delta)))/(2*(1+Math.cos(delta))));
    const R=rho+h, r=rho-h, bars=[], joints=[], rails=[];
    for(let plane=0;plane<3;plane++) {
      const outer=[],inner=[];
      for(let j=0;j<CELLS;j++) {
        const t=j*delta;
        outer.push(point(plane,R*Math.cos(t),R*Math.sin(t)));
        inner.push(point(plane,r*Math.cos(t),r*Math.sin(t)));
      }
      for(let j=0;j<CELLS;j++) {
        const k=(j+1)%CELLS, prefix='Hoop-'+(plane+1)+'/Cell-'+String(j+1).padStart(2,'0');
        bars.push({name:prefix+'/Link-A',a:outer[j],b:inner[k]});
        bars.push({name:prefix+'/Link-B',a:inner[j],b:outer[k]});
        // The central pin is the actual intersection, not the segment midpoint.
        const t=j*delta,u=k*delta,q=R*r/(R+r);
        joints.push({name:prefix+'/Pivot',p:point(plane,q*(Math.cos(t)+Math.cos(u)),q*(Math.sin(t)+Math.sin(u))),radius:1.95});
        joints.push({name:prefix+'/Outer-hinge',p:outer[j],radius:2.30});
        joints.push({name:prefix+'/Inner-hinge',p:inner[j],radius:1.85});
      }
      rails.push({name:'Hoop-'+(plane+1)+'/Outer-guide',points:outer});
      rails.push({name:'Hoop-'+(plane+1)+'/Inner-guide',points:inner});
    }
    // Stable order determined by Listening, independent of expansion state.
    return {state,cfg,bars,joints,rails,R,r,rho,diameter:2*R,linkLength:LINK};
  }
  const reference=build('Listening');
  const order=new Map(reference.bars.map((b,i)=>[b.name,(b.a.z+b.b.z)/2]));
  const jointOrder=new Map(reference.joints.map(b=>[b.name,b.p.z]));
  function ordered(state) {
    const m=build(state);
    m.bars.sort((a,b)=>order.get(a.name)-order.get(b.name));
    m.joints.sort((a,b)=>jointOrder.get(a.name)-jointOrder.get(b.name));
    return m;
  }
  function hex(h) {return {r:parseInt(h.slice(1,3),16)/255,g:parseInt(h.slice(3,5),16)/255,b:parseInt(h.slice(5,7),16)/255};}
  return { SIZE,CELLS,LINK,COLORS,STATES,build:ordered,hex };
})();
if(typeof module!=='undefined') module.exports=LegacyV1Geometry;

/* v3 restores the actual v1 scissor graph. No raster, orbit icon, or root motion. */
const SphereGeometry=(()=>{
  const V1=typeof LegacyV1Geometry!=='undefined'?LegacyV1Geometry:require('./legacy-v1.js');
  const SIZE=360,CENTER=180,OFFSET=40,GENERATION='structure-v3',CELLS=12;
  const COLORS=V1.COLORS,BASE_DIAMETER=V1.build('Thinking').diameter;
  const STATES={Listening:{source:'v1/Thinking',rho:80,linkLength:54},Thinking:{rho:54,linkLength:42},Speaking:{rho:124,linkLength:70}};
  const reference=V1.build('Listening'),barOrder=new Map(reference.bars.map((b,i)=>[b.name,i])),pinOrder=new Map(reference.joints.map((j,i)=>[j.name,i]));
  function projectPoint(plane,x,y,yaw=.57,pitch=.48){
    const raw=plane===0?[x,y,0]:plane===1?[x,0,y]:[0,x,y];
    const X=raw[0]*Math.cos(yaw)+raw[2]*Math.sin(yaw),Z=-raw[0]*Math.sin(yaw)+raw[2]*Math.cos(yaw);
    const Y=raw[1]*Math.cos(pitch)-Z*Math.sin(pitch),depth=raw[1]*Math.sin(pitch)+Z*Math.cos(pitch);
    return {x:CENTER+X*Math.cos(.16)-Y*Math.sin(.16),y:CENTER+X*Math.sin(.16)+Y*Math.cos(.16),z:depth};
  }
  function translateV1(state){const m=V1.build(state),point=p=>({x:p.x+OFFSET,y:p.y+OFFSET,z:p.z});
    return {...m,bars:m.bars.map(b=>({...b,a:point(b.a),b:point(b.b)})),joints:m.joints.map(j=>({...j,p:point(j.p)})),rails:m.rails.map(r=>({...r,points:r.points.map(point)}))};}
  function generateScissorGeometry({rho,linkLength=54,yaw=.57,pitch=.48,cfg}){
    const d=2*Math.PI/CELLS,radicand=(linkLength*linkLength-2*rho*rho*(1-Math.cos(d)))/(2*(1+Math.cos(d)));
    if(radicand<=0)throw new Error('Scissor pose exceeds linkage range');
    const h=Math.sqrt(radicand),R=rho+h,r=rho-h,bars=[],joints=[],rails=[];
    if(r<=0)throw new Error('Scissor inner radius must remain positive');
    for(let plane=0;plane<3;plane++){
      const P=(x,y)=>projectPoint(plane,x,y,yaw,pitch),outer=[],inner=[];
      for(let j=0;j<CELLS;j++){const t=j*d;outer.push(P(R*Math.cos(t),R*Math.sin(t)));inner.push(P(r*Math.cos(t),r*Math.sin(t)));}
      for(let j=0;j<CELLS;j++){const k=(j+1)%CELLS,name='Hoop-'+(plane+1)+'/Cell-'+String(j+1).padStart(2,'0'),t=j*d,u=k*d,q=R*r/(R+r);
        bars.push({name:name+'/Link-A',a:outer[j],b:inner[k]},{name:name+'/Link-B',a:inner[j],b:outer[k]});
        joints.push({name:name+'/Pivot',p:P(q*(Math.cos(t)+Math.cos(u)),q*(Math.sin(t)+Math.sin(u))),radius:1.95},{name:name+'/Outer-hinge',p:outer[j],radius:2.30},{name:name+'/Inner-hinge',p:inner[j],radius:1.85});}
      rails.push({name:'Hoop-'+(plane+1)+'/Outer-guide',points:outer},{name:'Hoop-'+(plane+1)+'/Inner-guide',points:inner});
    }
    bars.sort((a,b)=>barOrder.get(a.name)-barOrder.get(b.name));joints.sort((a,b)=>pinOrder.get(a.name)-pinOrder.get(b.name));
    return {rho,R,r,linkLength,diameter:2*R,bars,joints,rails,cfg,yaw,pitch};
  }
  function contractStructure(){return generateScissorGeometry({rho:54,linkLength:42,yaw:.57,pitch:.48,cfg:{glow:.20,node:.82,energy:.08}});}
  function expandStructure(){return generateScissorGeometry({rho:124,linkLength:70,yaw:.57,pitch:.48,cfg:{glow:.40,node:1,energy:.30}});}
  function build(state){let m;if(state==='Listening')m=translateV1('Thinking');else if(state==='Thinking')m=contractStructure();else if(state==='Speaking')m=expandStructure();else throw new Error('Unknown state: '+state);
    return {...m,state,phase:0,energyRadius:m.R+19,generation:GENERATION,hollowRatio:(m.r/m.R)**2,density:m.bars.length*m.linkLength/(Math.PI*m.R*m.R)};}
  function listeningPose(expanded=true){const m=translateV1(expanded?'Thinking':'Listening');return {...m,state:'Listening',phase:expanded?0:1,energyRadius:m.R+19,generation:GENERATION};}
  return {SIZE,CENTER,CELLS,BASE_DIAMETER,GENERATION,COLORS,STATES,build,listeningPose,contractStructure,expandStructure,generateScissorGeometry,projectPoint,hex:V1.hex};
})();
if(typeof module!=='undefined')module.exports=SphereGeometry;

/* Input/envelope/mapping are separate from rotation and graph geometry. */
const SphereVolume=(()=>{
 const G=typeof SphereGeometry!=='undefined'?SphereGeometry:require('./geometry.js');
 const DEFAULT=60,ATTACK=.08,RELEASE=.18,MIN_SCALE=G.build('Thinking').R/G.build('Speaking').R;
 const POINTS=Object.freeze([[0,0],[.3,20],[.7,65],[1.1,35],[1.5,80],[1.9,45],[2.3,90],[2.7,30],[3.1,70],[3.5,20],[4,0]].map(p=>Object.freeze(p)));
 function clamp(level){const n=Number(level);if(!Number.isFinite(n))throw new Error('Volume must be a finite number');return Math.max(0,Math.min(100,n));}
 function scaleFor(level){return MIN_SCALE+(1-MIN_SCALE)*clamp(level)/100;}
 class Controller {
  constructor(level=DEFAULT){this.target=clamp(level);this.value=this.target;this.lastTime=null;}
  setSpeakingVolume(level){this.target=clamp(level);return this.target;}
  advance(delta){if(!Number.isFinite(delta)||delta<0)throw new Error('Volume delta time must be non-negative');const tau=this.target>this.value?ATTACK:RELEASE;this.value+=(this.target-this.value)*(-Math.expm1(-delta/tau));return this.value;}
  at(seconds){if(!Number.isFinite(seconds)||seconds<0)throw new Error('Invalid volume clock');if(this.lastTime!==null&&seconds<this.lastTime)return this.value;const dt=this.lastTime===null?0:seconds-this.lastTime;this.lastTime=seconds;return this.advance(dt);}
 }
 function demoVolumeCurve(seconds){if(seconds<=0||seconds>=4)return 0;for(let i=1;i<POINTS.length;i++){const a=POINTS[i-1],b=POINTS[i];if(seconds<=b[0])return a[1]+(b[1]-a[1])*(seconds-a[0])/(b[0]-a[0]);}return 0;}
 class DemoEnvelope {
  constructor(){this.rate=240;this.values=new Float64Array(5*this.rate+1);const c=new Controller(0);for(let i=1;i<this.values.length;i++){c.setSpeakingVolume(demoVolumeCurve(i/this.rate));this.values[i]=c.advance(1/this.rate);}}
  sample(seconds){if(seconds<=0)return {target:0,level:0};if(seconds>=5)return {target:0,level:this.values[this.values.length-1]*Math.exp(-(seconds-5)/RELEASE)};const position=seconds*this.rate,i=Math.floor(position),t=position-i;return {target:demoVolumeCurve(seconds),level:this.values[i]+(this.values[i+1]-this.values[i])*t};}
 }
 return {DEFAULT,ATTACK,RELEASE,MIN_SCALE,POINTS,clamp,scaleFor,Controller,DemoEnvelope,demoVolumeCurve};
})();
if(typeof module!=='undefined')module.exports=SphereVolume;

/* Absolute-time animation of the existing graph. Shared by Plugin UI and HTML. */
const SphereMotion=(()=>{
  const V=typeof SphereVolume!=='undefined'?SphereVolume:require('./volume.js'),G=typeof SphereGeometry!=='undefined'?SphereGeometry:require('./geometry.js'),TAU=Math.PI*2;
  const SETTINGS=Object.freeze({
    Listening:Object.freeze({cycleSeconds:4.2,speedRatio:2.4/4.2}),
    Thinking:Object.freeze({amplitude:.03,breathSeconds:5,rotationSeconds:[10,-14,18]}),
    Speaking:Object.freeze({amplitude:0,volumeControlled:true,rotationSeconds:[8,-11,16]})
  });
  const AXES=[[0,1,.15],[.15,1,0],[0,1,-.2]].map(v=>{const n=Math.hypot(...v);return v.map(x=>x/n);});
  function buildGraph(model){
    const vertices=model.joints.map(j=>({id:j.name,layer:Number(j.name.match(/^Hoop-(\d)/)[1])-1,radius:j.radius})),lookup=new Map(vertices.map((v,i)=>[v.id,i]));
    const positions=new Float64Array(vertices.length*3);
    model.joints.forEach((j,i)=>{positions[i*3]=j.p.x-G.CENTER;positions[i*3+1]=j.p.y-G.CENTER;positions[i*3+2]=j.p.z;});
    const idx=name=>{const i=lookup.get(name);if(i===undefined)throw new Error('Missing vertex '+name);return i;};
    const bars=model.bars.map(b=>{const m=/^(Hoop-\d)\/Cell-(\d+)\/Link-([AB])$/.exec(b.name);if(!m)throw new Error('Unknown strut '+b.name);
      const cell=Number(m[2]),next=cell%G.CELLS+1,p=m[1]+'/Cell-',a=p+String(cell).padStart(2,'0'),z=p+String(next).padStart(2,'0'),A=m[3]==='A';
      return {name:b.name,layer:Number(m[1].slice(5))-1,a:idx(a+(A?'/Outer-hinge':'/Inner-hinge')),b:idx(z+(A?'/Inner-hinge':'/Outer-hinge')),pivot:idx(a+'/Pivot')};});
    const rails=model.rails.map(r=>{const m=/^(Hoop-\d)\/(Outer|Inner)-guide$/.exec(r.name);return {name:r.name,indices:Array.from({length:G.CELLS},(_,j)=>idx(m[1]+'/Cell-'+String(j+1).padStart(2,'0')+'/'+m[2]+'-hinge'))};});
    const adjacency=vertices.map(()=>new Set());for(const e of bars)for(const [a,b]of [[e.a,e.pivot],[e.pivot,e.b]]){adjacency[a].add(b);adjacency[b].add(a);}
    const seen=new Set(),components=[];for(let i=0;i<vertices.length;i++)if(!seen.has(i)){const queue=[i],component=[];seen.add(i);while(queue.length){const j=queue.pop();component.push(j);for(const k of adjacency[j])if(!seen.has(k)){seen.add(k);queue.push(k);}}components.push(component);}
    // Independent layers are allowed only when all actual graph edges remain local.
    const independent=components.length===3&&components.every(c=>new Set(c.map(i=>vertices[i].layer)).size===1);
    const coincident=new Map();for(let i=0;i<vertices.length;i++){const key=Array.from(positions.subarray(i*3,i*3+3),x=>x.toFixed(7)).join(',');const list=coincident.get(key)||[];list.push(vertices[i].id);coincident.set(key,list);}
    return {vertices,bars,rails,positions,components,independent,coincidentGroups:[...coincident.values()].filter(v=>v.length>1)};
  }
  function createSample(graph){return {positions:new Float64Array(graph.positions.length),angles:new Float64Array(3),matrices:new Float64Array(27),outerRadii:new Float64Array(2),breathingScale:1,time:0,cfg:{glow:0,node:0,energy:0},counterRotation:graph.independent};}
  function matrix(axis,angle,out,offset){const [x,y,z]=axis,c=Math.cos(angle%TAU),s=Math.sin(angle%TAU),t=1-c;
    out[offset]=t*x*x+c;out[offset+1]=t*x*y-s*z;out[offset+2]=t*x*z+s*y;
    out[offset+3]=t*x*y+s*z;out[offset+4]=t*y*y+c;out[offset+5]=t*y*z-s*x;
    out[offset+6]=t*x*z-s*y;out[offset+7]=t*y*z+s*x;out[offset+8]=t*z*z+c;}
  function transformGraph(graph,angles,scale,out,basePositions=graph.positions){
    for(let layer=0;layer<3;layer++)matrix(AXES[graph.independent?layer:0],angles[layer],out.matrices,layer*9);
    for(let i=0;i<graph.vertices.length;i++){const a=i*3,b=graph.vertices[i].layer*9,x=basePositions[a],y=basePositions[a+1],z=basePositions[a+2],M=out.matrices;
      out.positions[a]=(M[b]*x+M[b+1]*y+M[b+2]*z)*scale;out.positions[a+1]=(M[b+3]*x+M[b+4]*y+M[b+5]*z)*scale;out.positions[a+2]=(M[b+6]*x+M[b+7]*y+M[b+8]*z)*scale;}
    return out;
  }
  class Engine {
    constructor(){this.models={};this.graphs={};this.samples={};for(const state of Object.keys(G.STATES)){const m=G.build(state);this.models[state]=m;this.graphs[state]=buildGraph(m);this.samples[state]=createSample(this.graphs[state]);}
      this.volumeController=new V.Controller();this.contractedModel=G.listeningPose(false);this.contractedGraph=buildGraph(this.contractedModel);
    }
    sample(state,seconds){if(state==='Speaking')return this.sampleSpeaking(seconds);if(!Number.isFinite(seconds)||seconds<0)throw new Error('Elapsed seconds must be finite and non-negative');const m=this.models[state],g=this.graphs[state],out=this.samples[state];if(!g)throw new Error('Unknown state '+state);out.time=seconds;out.counterRotation=state!=='Listening'&&g.independent;
      if(state==='Listening'){
        // Same v3 endpoints and easing, all timing stretched by 1.75 (57.1% speed).
        const half=SETTINGS.Listening.cycleSeconds/2,hold=.05*1.75,phase=seconds%(half*2),reverse=phase>=half,u=Math.min(1,Math.max(0,((phase%half)-hold)/(half-hold))),ease=(1-Math.cos(Math.PI*u))/2,t=reverse?1-ease:ease;
        const end=this.contractedGraph.positions;for(let i=0;i<out.positions.length;i++)out.positions[i]=g.positions[i]+(end[i]-g.positions[i])*t;
        out.angles.fill(0);out.breathingScale=1;const R=m.R+(this.contractedModel.R-m.R)*t;out.outerRadii[0]=R+9;out.outerRadii[1]=R+19;
        for(const key of ['glow','node','energy'])out.cfg[key]=m.cfg[key]+(this.contractedModel.cfg[key]-m.cfg[key])*t;
      }else{
        const settings=SETTINGS[state],scale=1+settings.amplitude*Math.sin(TAU*seconds/settings.breathSeconds);out.breathingScale=scale;
        for(let layer=0;layer<3;layer++){const effective=g.independent?layer:0;out.angles[layer]=TAU*seconds/settings.rotationSeconds[effective];matrix(AXES[effective],out.angles[layer],out.matrices,layer*9);}
        for(let i=0;i<g.vertices.length;i++){const a=i*3,b=g.vertices[i].layer*9,x=g.positions[a],y=g.positions[a+1],z=g.positions[a+2],M=out.matrices;
          out.positions[a]=(M[b]*x+M[b+1]*y+M[b+2]*z)*scale;out.positions[a+1]=(M[b+3]*x+M[b+4]*y+M[b+5]*z)*scale;out.positions[a+2]=(M[b+6]*x+M[b+7]*y+M[b+8]*z)*scale;}
        out.outerRadii[0]=m.R+9;out.outerRadii[1]=m.R+19;Object.assign(out.cfg,m.cfg);
      }
      out.structureScale=out.breathingScale;return out;
    }
    setSpeakingVolume(level){return this.volumeController.setSpeakingVolume(level);}
    sampleSpeaking(seconds,volume,options={}){
      if(!Number.isFinite(seconds)||seconds<0)throw new Error('Elapsed seconds must be finite and non-negative');
      const level=volume===undefined?this.volumeController.at(seconds):V.clamp(volume),g=this.graphs.Speaking,m=this.models.Speaking,out=options.out||this.samples.Speaking,scale=V.scaleFor(level);
      if(options.angles)out.angles.set(options.angles);else for(let layer=0;layer<3;layer++)out.angles[layer]=TAU*seconds/SETTINGS.Speaking.rotationSeconds[g.independent?layer:0];
      transformGraph(g,out.angles,scale,out);out.time=seconds;out.structureScale=scale;out.breathingScale=scale;out.volumeLevel=level;out.radius=m.R*scale;out.innerRadius=m.r*scale;out.counterRotation=g.independent;out.outerRadii[0]=m.R+9;out.outerRadii[1]=m.R+19;Object.assign(out.cfg,m.cfg);return out;
    }
    topologyReport(state='Thinking'){const g=this.graphs[state];return {vertices:g.vertices.length,struts:g.bars.length,components:g.components.map(c=>({count:c.length,hoops:[...new Set(c.map(i=>g.vertices[i].layer+1))]})),independentCounterRotation:g.independent,crossHoopEdges:g.bars.filter(e=>g.vertices[e.a].layer!==g.vertices[e.b].layer).length,coincidentButDistinctVertexGroups:g.coincidentGroups.length};}
  }
  class Clock {
    constructor(now=()=>performance.now()){this.now=now;this.start=now();this.pausedAt=0;this.totalPaused=0;this.reasons=new Set();}
    seconds(){return ((this.reasons.size?this.pausedAt:this.now())-this.start-this.totalPaused)/1000;}
    pause(reason='manual'){if(!this.reasons.size)this.pausedAt=this.now();this.reasons.add(reason);}
    resume(reason='manual'){if(!this.reasons.has(reason))return;this.reasons.delete(reason);if(!this.reasons.size)this.totalPaused+=this.now()-this.pausedAt;}
    get paused(){return this.reasons.size>0;}
  }
  return {SETTINGS,AXES,Engine,Clock,buildGraph,createSample,transformGraph};
})();
if(typeof module!=='undefined')module.exports=SphereMotion;

/* Shared structural timeline; standard 12.2s and independent 13.2s volume demo. */
const SphereCycle=(()=>{
 const G=typeof SphereGeometry!=='undefined'?SphereGeometry:require('./geometry.js'),M=typeof SphereMotion!=='undefined'?SphereMotion:require('./animation.js'),V=typeof SphereVolume!=='undefined'?SphereVolume:require('./volume.js'),TAU=2*Math.PI;
 const VERSION='native-cycle-v5',VOLUME_VERSION='native-volume-v6',DURATION=12.2,VOLUME_DURATION=13.2;
 function makeStages(speakingSeconds){const s=[
  {key:'Listening',label:'Listening',from:'Listening',to:'Listening',duration:3},
  {key:'Listening→Thinking',label:'Listening → Thinking',from:'Listening',to:'Thinking',duration:1},
  {key:'Thinking',label:'Thinking',from:'Thinking',to:'Thinking',duration:3},
  {key:'Thinking→Speaking',label:'Thinking → Speaking',from:'Thinking',to:'Speaking',duration:1.2},
  {key:'Speaking',label:'Speaking',from:'Speaking',to:'Speaking',duration:speakingSeconds},
  {key:'Speaking→Listening',label:'Speaking → Listening',from:'Speaking',to:'Listening',duration:1}];let cursor=0;for(const stage of s){stage.start=cursor;cursor+=stage.duration;stage.end=cursor;}return s;}
 const STAGES=makeStages(3),VOLUME_STAGES=makeStages(4),smooth=u=>u*u*(3-2*u),integral=u=>u*u*u-.5*u*u*u*u;
 function stageAt(local,stages=STAGES){return stages.find(s=>local<s.end-1e-10)||stages[stages.length-1];}
 function rates(state,layer){return state==='Listening'?0:1/Math.abs(M.SETTINGS[state].rotationSeconds[layer]);}
 function spinIntegral(local,layer,stages=STAGES){let sum=0;for(const s of stages){if(local<=s.start)break;const u=Math.min(1,(local-s.start)/s.duration),a=rates(s.from,layer),b=rates(s.to,layer);sum+=s.duration*(a*u+(b-a)*integral(u));}return sum;}
 class Sampler {
  constructor(mode='standard'){this.mode=mode;this.duration=mode==='volume'?VOLUME_DURATION:DURATION;this.stages=mode==='volume'?VOLUME_STAGES:STAGES;this.envelope=new V.DemoEnvelope();this.engine=new M.Engine();this.graph=this.engine.graphs.Listening;this.output=M.createSample(this.graph);this.basePositions=new Float64Array(this.graph.positions.length);this.models=this.engine.models;this.contracted=G.listeningPose(false);this.totals=[0,1,2].map(i=>spinIntegral(this.duration,i,this.stages));}
  radial(state,phase,volume=100){const m=this.models[state];if(state==='Listening'){
    const half=2.1,q=(phase/TAU*4.2)%4.2,reverse=q>=half,u=Math.min(1,Math.max(0,((q%half)-.0875)/(half-.0875))),e=(1-Math.cos(Math.PI*u))/2,w=reverse?1-e:e,cfg={};for(const k of ['glow','node','energy'])cfg[k]=m.cfg[k]+(this.contracted.cfg[k]-m.cfg[k])*w;
    const R=m.R+(this.contracted.R-m.R)*w,r=m.r+(this.contracted.r-m.r)*w;return {R,r,rings:[R+9,R+19],cfg,pinScale:1};
   }
   const scale=state==='Speaking'?V.scaleFor(volume):1+M.SETTINGS[state].amplitude*Math.sin(phase);return {R:m.R*scale,r:m.r*scale,rings:[m.R+9,m.R+19],cfg:m.cfg,pinScale:state==='Speaking'?scale:1};
  }
  sample(seconds){if(!Number.isFinite(seconds)||seconds<0)throw new Error('Invalid cycle time');const cycle=Math.floor(seconds/this.duration),local=seconds-cycle*this.duration,stage=stageAt(local,this.stages),u=Math.min(1,Math.max(0,(local-stage.start)/stage.duration)),mix=stage.from===stage.to?0:smooth(u),phase=TAU*3*local/this.duration;
   const voice=this.mode==='volume'?this.envelope.sample(local-this.stages[4].start):{target:100,level:100},a=this.radial(stage.from,phase,voice.level),b=this.radial(stage.to,phase,voice.level),lerp=(x,y)=>x+(y-x)*mix,R=lerp(a.R,b.R),r=lerp(a.r,b.r),cfg={};for(const k of ['glow','node','energy'])cfg[k]=lerp(a.cfg[k],b.cfg[k]);
   const out=this.output;for(let layer=0;layer<3;layer++)out.angles[layer]=(layer===1?-1:1)*TAU*(cycle+spinIntegral(local,layer,this.stages)/this.totals[layer]);
   if(stage.from==='Speaking'&&stage.to==='Speaking'){
    // The exact same function used by the HTML slider. Only demo rotation phase is fitted to the loop.
    this.engine.sampleSpeaking(seconds,voice.level,{angles:out.angles,out});
   }else{
    const rho=(R+r)/2,d=TAU/G.CELLS,linkLength=Math.sqrt(R*R+r*r-2*R*r*Math.cos(d)),model=G.generateScissorGeometry({rho,linkLength,cfg});
    for(let i=0;i<model.joints.length;i++){const p=model.joints[i].p,k=i*3;this.basePositions[k]=p.x-G.CENTER;this.basePositions[k+1]=p.y-G.CENTER;this.basePositions[k+2]=p.z;}
    M.transformGraph(this.graph,out.angles,1,out,this.basePositions);
   }
   out.time=seconds;out.localTime=local;out.stage=stage.key;out.label=stage.label+(this.mode==='volume'&&stage.key==='Speaking'?' · '+voice.level.toFixed(0):'');out.state=stage.from===stage.to?stage.from:stage.to;out.mix=mix;out.phase=TAU*3*seconds/this.duration;out.radius=R;out.innerRadius=r;out.cfg=cfg;out.outerRadii[0]=lerp(a.rings[0],b.rings[0]);out.outerRadii[1]=lerp(a.rings[1],b.rings[1]);out.structureScale=lerp(a.pinScale,b.pinScale);out.volumeLevel=voice.level;out.volumeTarget=voice.target;return out;
  }
 }
 function plan(fps=30,mode='standard'){const volume=mode==='volume';if(!(volume?[10,12]:[15,20,30]).includes(fps))throw new Error('Unsupported preview fps');if(!volume){const count=Math.round(DURATION*fps),step=DURATION/count;return Array.from({length:count},(_,i)=>({index:i,time:i*step,delay:step,next:(i+1)%count,stage:stageAt(i*step).key}));}
  const result=[];for(const stage of VOLUME_STAGES){const count=Math.round(stage.duration*fps),step=stage.duration/count;for(let i=0;i<count;i++)result.push({index:result.length,time:stage.start+i*step,delay:step,stage:stage.key});}result.forEach((p,i)=>p.next=(i+1)%result.length);return result;
 }
 return {VERSION,VOLUME_VERSION,DURATION,VOLUME_DURATION,STAGES,VOLUME_STAGES,Sampler,plan,spinIntegral};
})();
if(typeof module!=='undefined')module.exports=SphereCycle;

/* Native Figma flipbook. Compact editable vectors, no image fills or HTML playback. */
const SpherePrototype=(()=>{
 const G=typeof SphereGeometry!=='undefined'?SphereGeometry:require('./geometry.js'),C=typeof SphereCycle!=='undefined'?SphereCycle:require('./cycle.js');
 const ROLE='native-cycle-frame',FLOW='Socrates · Listening → Thinking → Speaking · 12.2s';
 const smooth=x=>{const t=Math.min(1,Math.max(0,x));return t*t*(3-2*t);};
 function buckets(sample,graph){const groups=new Map(),P=sample.positions,r=sample.radius||150;
  const add=(name,kind,color,alpha,weight,item)=>{if(!groups.has(name))groups.set(name,{name,kind,color,alpha,weight,items:[]});groups.get(name).items.push(item);};
  for(const rail of graph.rails)add('01 Guides','poly','dark',.22,.7,rail.indices.map(i=>({x:P[i*3]+180,y:P[i*3+1]+180})));
  for(const bar of graph.bars){const a=bar.a*3,b=bar.b*3,depth=smooth(.5+(P[a+2]+P[b+2])/(4*r)),bucket=Math.min(2,Math.floor(depth*3)),p=[{x:P[a]+180,y:P[a+1]+180},{x:P[b]+180,y:P[b+1]+180}];
   add('02 Links / depth '+bucket,'line','main',.32+.32*bucket,2.7,p);add('03 Light edges / depth '+bucket,'line','light',.08+.30*bucket,.78,p);
  }
  for(let i=0;i<graph.vertices.length;i++){const v=graph.vertices[i],depth=smooth(.5+P[i*3+2]/(2*r)),bucket=Math.min(2,Math.floor(depth*3)),p={x:P[i*3]+180,y:P[i*3+1]+180};
   add('04 Seats / depth '+bucket,'circle','dark',.35+.275*bucket,0,{...p,r:(v.radius+.65)*(sample.structureScale||1)});add('05 Pins / depth '+bucket,'circle','node',sample.cfg.node*(.35+.325*bucket),0,{...p,r:v.radius*.66*(sample.structureScale||1)});
  }
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));
 }
 function vectorData(group){const points=group.kind==='circle'?group.items.flatMap(c=>[{x:c.x-c.r,y:c.y-c.r},{x:c.x+c.r,y:c.y+c.r}]):group.items.flat();const x=Math.min(...points.map(p=>p.x)),y=Math.min(...points.map(p=>p.y)),n=v=>Number(v.toFixed(4));
  const paths=group.items.map(item=>{let d;if(group.kind==='circle'){const X=item.x-x,Y=item.y-y,r=item.r,k=r*.5522847498307936;d=`M ${n(X+r)} ${n(Y)} C ${n(X+r)} ${n(Y+k)} ${n(X+k)} ${n(Y+r)} ${n(X)} ${n(Y+r)} C ${n(X-k)} ${n(Y+r)} ${n(X-r)} ${n(Y+k)} ${n(X-r)} ${n(Y)} C ${n(X-r)} ${n(Y-k)} ${n(X-k)} ${n(Y-r)} ${n(X)} ${n(Y-r)} C ${n(X+k)} ${n(Y-r)} ${n(X+r)} ${n(Y-k)} ${n(X+r)} ${n(Y)} Z`;}else d=item.map((p,i)=>(i?'L':'M')+' '+n(p.x-x)+' '+n(p.y-y)).join(' ')+(group.kind==='poly'?' Z':'');return {windingRule:'NONZERO',data:d};});return {x,y,paths};
 }
 function render(parent,sample,graph,t,created){
  const root=figma.createFrame();parent.appendChild(root);clearFrame(root);root.name='Socrates Sphere / sampled vectors';root.resize(360,360);root.x=30;root.y=62;created.push(root.id);
  for(let i=0;i<2;i++){const e=dot(root,'Outer energy ring '+(i+1),{x:180,y:180},sample.outerRadii[i],'glow',0,t);e.fills=[];e.strokes=[boundPaint('main',sample.cfg.energy/(i+1),t)];e.strokeWeight=.9;created.push(e.id);}
  for(const group of buckets(sample,graph)){const d=vectorData(group),v=figma.createVector();root.appendChild(v);v.name=group.name;v.vectorPaths=d.paths;v.x=d.x;v.y=d.y;
   if(group.kind==='circle'){v.fills=[boundPaint(group.color,group.alpha,t)];v.strokes=[];}else{v.fills=[];v.strokes=[boundPaint(group.color,group.alpha,t)];v.strokeWeight=group.weight;v.strokeCap='ROUND';v.strokeJoin='ROUND';}created.push(v.id);
  }
  return root;
 }
 function verify(frames,page,plan){if(frames.length!==plan.length)throw new Error('Incomplete native frame sequence');
  for(let i=0;i<frames.length;i++){const r=frames[i].reactions;if(r.length!==1||r[0].trigger?.type!=='AFTER_TIMEOUT'||Math.abs(r[0].trigger.timeout-plan[i].delay)>1e-6||r[0].actions?.[0]?.destinationId!==frames[plan[i].next].id||r[0].actions[0].transition!==null)throw new Error('Native cycle connection mismatch at '+i);}
  if(!page.flowStartingPoints.some(p=>p.nodeId===frames[0].id))throw new Error('Missing Flow Starting Point');return true;
 }
 async function create(fps=30,mode='standard'){checkFile();const p=figma.currentPage;if(p.type!=='PAGE')throw new Error('請先開啟要放預覽的 Figma Page');const volume=mode==='volume',version=volume?C.VOLUME_VERSION:C.VERSION,duration=volume?C.VOLUME_DURATION:C.DURATION,storeKey=(volume?'socrates-volume-cycle:':'socrates-native-cycle:')+ (figma.fileKey||figma.root.name)+':'+p.id,plan=C.plan(fps,mode),flowName=(volume?'Socrates · 音量循環 · 13.2s':FLOW)+' · '+fps+' fps',old=await figma.clientStorage.getAsync(storeKey);
  if(old?.version===version&&old.fps===fps){const frames=await Promise.all(old.frameIds.map(node));if(frames.every(n=>n&&n.parent===p&&role(n)===ROLE)){verify(frames,p,plan);p.selection=[frames[0]];figma.viewport.scrollAndZoomIntoView([frames[0]]);return {...old,page:p.name,pageId:p.id,operation:volume?'volume-cycle':'native-cycle',status:'already',prototypeCreated:true,presentPlaybackVerified:false,note:'已定位完整原生循環起始 Frame；請關閉外掛，按右上角 Present。實際播放尚待人工驗證。'};}}
  const f=await font(),t=await tokens(),pos=safePosition(p),sampler=new C.Sampler(mode),created=[],frames=[];
  try{
   post('progress',{message:'建立 Figma 原生循環：0 / '+plan.length+' 影格'});
   for(const key of plan){const sample=sampler.sample(key.time),fr=tag(figma.createFrame(),ROLE);p.appendChild(fr);fr.name=(volume?'Socrates Volume Cycle / ':'Socrates Cycle / ')+String(key.index).padStart(3,'0')+' / '+sample.label;fr.resize(420,480);fr.x=pos.x+(key.index%12)*460;fr.y=pos.y+Math.floor(key.index/12)*520;fr.fills=[{type:'SOLID',color:G.hex('#123F37')}];created.push(fr.id);frames.push(fr);
    const title=text(fr,'Phase',sample.label,30,22,360,18,f,'#DDF8F1');created.push(title.id);render(fr,sample,sampler.graph,t,created);
    const foot=text(fr,'Loop guide',volume?'Speaking Volume 曲線 · 13.2 秒自動循環':'Listening → Thinking → Speaking · 12.2 秒自動循環',30,442,360,11,f,'#BFECE1');created.push(foot.id);
    if(key.index%12===11){post('progress',{message:'建立 Figma 原生循環：'+(key.index+1)+' / '+plan.length+' 影格'});await new Promise(resolve=>setTimeout(resolve,0));}
   }
   for(const key of plan)await frames[key.index].setReactionsAsync([{trigger:{type:'AFTER_TIMEOUT',timeout:key.delay},actions:[{type:'NODE',navigation:'NAVIGATE',destinationId:frames[key.next].id,transition:null,resetScrollPosition:true}]}]);
   p.flowStartingPoints=[...p.flowStartingPoints.filter(s=>s.nodeId!==frames[0].id),{nodeId:frames[0].id,name:flowName}];verify(frames,p,plan);
   const record={version,fps,mode,page:p.name,pageId:p.id,frameIds:frames.map(n=>n.id),startFrameId:frames[0].id,startFrameName:frames[0].name,position:{x:frames[0].x,y:frames[0].y},durationSeconds:duration,nodeCount:created.length,flowName};await figma.clientStorage.setAsync(storeKey,record);p.selection=[frames[0]];figma.viewport.scrollAndZoomIntoView([frames[0]]);
   return {...record,operation:volume?'volume-cycle':'native-cycle',status:'created',prototypeCreated:true,presentPlaybackVerified:false,createdNodeIds:created,note:'原生 Frame、全部 After Delay 連線及 Flow 起點已讀回檢查。關閉外掛後，保持選取 '+frames[0].name+'，按右上角 Present；自動播放六階段並循環。實際 Present 順暢度與播放結果尚待人工驗證。'};
  }catch(error){const ownIds=new Set(frames.map(n=>n.id));p.flowStartingPoints=p.flowStartingPoints.filter(s=>!ownIds.has(s.nodeId));for(const fr of frames)if(!fr.removed)fr.remove();throw new Error('循環預覽建立失敗；本次新增 Frame 已回滾：'+err(error));}
 }
 return {ROLE,FLOW,buckets,vectorData,verify,create,createVolume:(fps=10)=>create(fps,'volume')};
})();
if(typeof module!=='undefined')module.exports=SpherePrototype;

/* Persistent native SVG elements; initialized once, coordinates updated in place. */
const SphereMotionView=(()=>{
  const NS='http://www.w3.org/2000/svg',G=SphereGeometry,C=G.COLORS,CACHE=new WeakMap();
  function svgNode(name,attrs={}){const n=document.createElementNS(NS,name);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;}
  function attr(n,k,v){const s=typeof v==='number'?String(Math.round(v*1000)/1000):String(v);let cache=CACHE.get(n);if(!cache){cache={};CACHE.set(n,cache);}if(cache[k]!==s){n.setAttribute(k,s);cache[k]=s;}}
  const smooth=x=>{const t=Math.min(1,Math.max(0,x));return t*t*(3-2*t);};
  class View {
    constructor(root){this.root=root;this.engine=new SphereMotion.Engine();this.clock=new SphereMotion.Clock();this.cards={};this.frames=0;this.lastTime=0;this.maxGap=0;this.recentGaps=[];this.lastHud=0;this.disposed=false;this.renderMs=[];
      const ref=LegacyV1Geometry.build('Listening');this.legacyDepth=new Map(ref.bars.map(b=>[b.name,(b.a.z+b.b.z)/2]));
      for(const state of Object.keys(G.STATES))this.cards[state]=this.createCard(root.querySelector('[data-motion-state="'+state+'"]'),state);
      this.volumeInput=root.querySelector('#speaking-volume');this.volumeOutput=root.querySelector('#speaking-volume-value');this.volumeInput.addEventListener('input',()=>this.setSpeakingVolume(this.volumeInput.value));
      this.pauseButton=root.querySelector('#motion-pause');this.pauseButton.onclick=()=>{if(this.clock.reasons.has('manual'))this.clock.resume();else this.clock.pause();this.syncButton();};
      this.visibility=()=>{if(document.hidden)this.clock.pause('hidden');else this.clock.resume('hidden');this.syncButton();};document.addEventListener('visibilitychange',this.visibility);
      this.tick=this.tick.bind(this);this.render(0);this.raf=requestAnimationFrame(this.tick);
    }
    createCard(host,state){const g=this.engine.graphs[state],m=this.engine.models[state],svg=svgNode('svg',{viewBox:'0 0 360 360',role:'img','aria-label':state+' 球體結構動畫'});host.appendChild(svg);
      const defs=svgNode('defs'),filter=svgNode('filter',{id:'node-glow-'+state,x:'-100%',y:'-100%',width:'300%',height:'300%'});filter.appendChild(svgNode('feGaussianBlur',{stdDeviation:1.4}));defs.appendChild(filter);svg.appendChild(defs);
      const ringGroup=svgNode('g',{'data-layer':'outer-rings'});svg.appendChild(ringGroup);const rings=[0,1].map(i=>{const n=svgNode('circle',{cx:180,cy:180,r:m.R+9+i*10,fill:'none',stroke:C.main,'stroke-width':.9,'stroke-opacity':m.cfg.energy/(i+1)});ringGroup.appendChild(n);return n;});
      const inner=svgNode('g',{'data-layer':'inner-structure'});svg.appendChild(inner);
      const rails=g.rails.map(r=>{const n=svgNode('polygon',{fill:'none',stroke:C.dark,'stroke-width':.7,'stroke-opacity':.22,'data-name':r.name});inner.appendChild(n);return n;});
      const bars=g.bars.map(e=>{const group=svgNode('g',{'data-name':e.name}),body=svgNode('path',{fill:'none',stroke:C.main,'stroke-width':2.7,'stroke-linecap':'round'}),light=svgNode('path',{fill:'none',stroke:C.light,'stroke-width':.78,'stroke-linecap':'round'});group.append(body,light);inner.appendChild(group);return {body,light};});
      const joints=g.vertices.map(v=>{const group=svgNode('g',{'data-name':v.id}),seat=svgNode('circle',{r:v.radius+.65,fill:C.dark}),pin=svgNode('circle',{r:v.radius*.66,fill:C.node});group.append(seat,pin);inner.appendChild(group);return {seat,pin};});
      return {svg,rings,rails,bars,joints,graph:g,model:m,inner};
    }
    updateCard(state,time){const c=this.cards[state],g=c.graph,m=c.model,s=this.engine.sample(state,time),P=s.positions;
      for(let i=0;i<2;i++){attr(c.rings[i],'r',s.outerRadii[i]);attr(c.rings[i],'stroke-opacity',s.cfg.energy/(i+1));}
      for(let i=0;i<g.rails.length;i++){let text='';for(const j of g.rails[i].indices)text+=(P[j*3]+180).toFixed(3)+','+(P[j*3+1]+180).toFixed(3)+' ';attr(c.rails[i],'points',text.trim());}
      for(let i=0;i<g.bars.length;i++){const e=g.bars[i],a=e.a*3,b=e.b*3,n=c.bars[i];
        const edge='M '+(P[a]+180).toFixed(3)+' '+(P[a+1]+180).toFixed(3)+' L '+(P[b]+180).toFixed(3)+' '+(P[b+1]+180).toFixed(3);attr(n.body,'d',edge);attr(n.light,'d',edge);
        if(state==='Listening'){const front=this.legacyDepth.get(e.name)>=0;attr(n.body,'stroke',front?C.main:C.dark);attr(n.body,'stroke-opacity',front?.96:.46);attr(n.body,'stroke-width',front?2.7:2.1);attr(n.light,'stroke-opacity',front?.68:.12);attr(n.light,'stroke-width',front?.78:.55);}
        else{const d=smooth(.5+(P[a+2]+P[b+2])/(4*m.R*s.breathingScale));attr(n.body,'stroke',C.main);attr(n.body,'stroke-opacity',.32+.64*d);attr(n.light,'stroke-opacity',.08+.60*d);}
      }
      for(let i=0;i<g.vertices.length;i++){const n=c.joints[i],a=i*3,v=g.vertices[i],scale=state==='Listening'?1:s.breathingScale;for(const dot of [n.seat,n.pin]){attr(dot,'cx',P[a]+180);attr(dot,'cy',P[a+1]+180);}attr(n.seat,'r',(v.radius+.65)*scale);attr(n.pin,'r',v.radius*.66*scale);
        if(state==='Listening'){const front=P[a+2]>=0;attr(n.seat,'fill-opacity',front?.9:.42);attr(n.pin,'fill-opacity',s.cfg.node*(front?1:.39));}
        else{const d=smooth(.5+P[a+2]/(2*m.R*scale));attr(n.seat,'fill-opacity',.35+.55*d);attr(n.pin,'fill-opacity',s.cfg.node*(.35+.65*d));}
      }
    }
    render(seconds){const begin=performance.now();for(const state of Object.keys(this.cards))this.updateCard(state,seconds);this.renderMs.push(performance.now()-begin);if(this.renderMs.length>240)this.renderMs.shift();}
    tick(now){if(this.disposed)return;if(!this.clock.paused){const time=this.clock.seconds();if(this.lastTime){const gap=time-this.lastTime;this.maxGap=Math.max(this.maxGap,gap);this.recentGaps.push(gap);if(this.recentGaps.length>240)this.recentGaps.shift();}this.lastTime=time;this.render(time);this.frames++;if(now-this.lastHud>500){this.lastHud=now;const d=this.diagnostics();this.root.querySelector('#motion-time').textContent='播放 '+d.elapsedSeconds.toFixed(1)+' 秒 · '+d.fps.toFixed(0)+' fps';}}
      this.raf=requestAnimationFrame(this.tick);
    }
    setSpeakingVolume(level){const value=this.engine.setSpeakingVolume(level);this.volumeInput.value=String(value);this.volumeOutput.textContent=String(Number(value.toFixed(1)));return value;}
    syncButton(){this.pauseButton.textContent=this.clock.reasons.has('manual')?'繼續動畫':'暫停動畫';}
    play(){this.clock.resume();this.syncButton();this.root.scrollIntoView({behavior:'smooth',block:'start'});}
    diagnostics(){const seconds=this.clock.seconds(),states={};for(const state of Object.keys(this.cards)){const s=this.engine.sample(state,seconds);states[state]={angles:Array.from(s.angles),breathingScale:s.breathingScale,structureScale:s.structureScale,volumeLevel:s.volumeLevel,volumeTarget:state==='Speaking'?this.engine.volumeController.target:undefined,outerRadii:Array.from(s.outerRadii),counterRotation:s.counterRotation};}const total=this.recentGaps.reduce((a,b)=>a+b,0);return {elapsedSeconds:seconds,frames:this.frames,paused:this.clock.paused,fps:total?this.recentGaps.length/total:0,maxFrameGapSeconds:this.maxGap,meanRenderMs:this.renderMs.reduce((a,b)=>a+b,0)/(this.renderMs.length||1),states,topology:this.engine.topologyReport(),environment:'Plugin UI / standalone HTML; Figma canvas is static'};}
    dispose(){this.disposed=true;cancelAnimationFrame(this.raf);document.removeEventListener('visibilitychange',this.visibility);}
  }
  return {View};
})();

/* Uses the same compact-vector descriptors as the native Present frame builder. */
const SphereCycleView=(()=>{
 class View {
  constructor(details,comparison,mode='standard'){this.details=details;this.comparison=comparison;this.canvas=details.querySelector('canvas');this.ctx=this.canvas.getContext('2d');this.sampler=new SphereCycle.Sampler(mode);this.pauseComparison=mode!=='volume';this.pauseReason='cycle-preview:'+details.id;this.clock=new SphereMotion.Clock();this.clock.pause('closed');this.frames=0;this.tick=this.tick.bind(this);details.addEventListener('toggle',()=>{if(details.open){this.clock.resume('closed');if(this.pauseComparison)comparison.clock.pause(this.pauseReason);this.raf=requestAnimationFrame(this.tick);}else{this.clock.pause('closed');if(this.pauseComparison)comparison.clock.resume(this.pauseReason);cancelAnimationFrame(this.raf);}});this.render(0);}
  render(seconds){const local=seconds%this.sampler.duration,frame=Math.floor(seconds*30),sample=this.sampler.sample(frame/30),groups=SpherePrototype.buckets(sample,this.sampler.graph),c=this.ctx;c.fillStyle='#123F37';c.globalAlpha=1;c.fillRect(0,0,360,400);
   for(let i=0;i<2;i++){c.beginPath();c.arc(180,180,sample.outerRadii[i],0,2*Math.PI);c.strokeStyle=SphereGeometry.COLORS.main;c.lineWidth=.9;c.globalAlpha=sample.cfg.energy/(i+1);c.stroke();}
   for(const group of groups){c.beginPath();for(const shape of group.items){if(group.kind==='circle'){c.moveTo(shape.x+shape.r,shape.y);c.arc(shape.x,shape.y,shape.r,0,2*Math.PI);}else{shape.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));if(group.kind==='poly')c.closePath();}}c.globalAlpha=group.alpha;c.lineCap='round';c.lineJoin='round';if(group.kind==='circle'){c.fillStyle=SphereGeometry.COLORS[group.color];c.fill();}else{c.strokeStyle=SphereGeometry.COLORS[group.color];c.lineWidth=group.weight;c.stroke();}}
   c.globalAlpha=1;c.fillStyle='#DDF8F1';c.font='16px system-ui';c.textAlign='center';c.fillText(sample.label,180,385);this.details.querySelector('[data-cycle-time]').textContent=local.toFixed(1)+' / '+this.sampler.duration.toFixed(1)+' 秒 · '+sample.label;this.frames++;
  }
  tick(){if(!this.details.open)return;this.render(this.clock.seconds());this.raf=requestAnimationFrame(this.tick);}
 }
 return {View};
})();
