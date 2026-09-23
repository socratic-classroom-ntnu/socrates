import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { Room } from './client'

/** Shared seats/focus are projected from the server; camera is local to this tab. */
export function Arena({room}:{room:Room}) {
  const host=useRef<HTMLDivElement>(null)
  const latest=useRef(room);latest.current=room
  useEffect(()=>{
    if(!host.current)return
    const container=host.current
    const scene=new THREE.Scene()
    const camera=new THREE.PerspectiveCamera(40,1,0.1,60);camera.position.set(0,3.3,8)
    let renderer:THREE.WebGLRenderer
    try {renderer=new THREE.WebGLRenderer({antialias:true,alpha:true})}
    catch {container.dataset.renderer='static';return}
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.setClearColor(0,0)
    renderer.outputColorSpace=THREE.SRGBColorSpace;container.appendChild(renderer.domElement)
    const controls=new OrbitControls(camera,renderer.domElement)
    controls.target.set(0,1,0);controls.enableDamping=true;controls.minDistance=3;controls.maxDistance=13;controls.maxPolarAngle=Math.PI*.48
    scene.add(new THREE.HemisphereLight(0xffede0,0x504269,2.8))
    const key=new THREE.DirectionalLight(0xffe6ca,3);key.position.set(3,5,5);scene.add(key)
    const fill=new THREE.DirectionalLight(0xbbc3ff,1.5);fill.position.set(-4,3,1);scene.add(fill)
    const platform=new THREE.Mesh(new THREE.CylinderGeometry(1.1,1.3,.16,64),new THREE.MeshStandardMaterial({color:0x776382,metalness:.2,roughness:.7}))
    platform.position.y=.03;scene.add(platform)
    const tutor=new THREE.Group();scene.add(tutor)
    let loaded=false,disposed=false
    new GLTFLoader().load('/avatars/ce-brunette/avatar.glb',(gltf)=>{
      if(disposed)return
      const model=gltf.scene; const box=new THREE.Box3().setFromObject(model);const size=box.getSize(new THREE.Vector3());const center=box.getCenter(new THREE.Vector3())
      const scale=2.4/Math.max(.1,size.y);model.scale.setScalar(scale)
      model.position.set(-center.x*scale,-box.min.y*scale,-center.z*scale);tutor.add(model);loaded=true
      container.dataset.renderer='gltf'
    },undefined,()=>{container.dataset.renderer='portrait-loading'})
    const seatGroup=new THREE.Group();scene.add(seatGroup);let seatSignature=''
    const disposables:{dispose:()=>void}[]=[]
    function seats(){
      const r=latest.current; const signature=r.members.map(m=>m.id+':'+m.seat).join(',')
      if(signature===seatSignature)return
      seatSignature=signature
      while(seatGroup.children.length)seatGroup.remove(seatGroup.children[0])
      const count=Math.max(r.members.length,1)
      r.members.forEach((m,i)=>{
        const ring=Math.floor(i/20);const n=Math.min(20,count-ring*20)
        const angle=((i%20)/n)*Math.PI*2;const radius=2.65+ring*.8
        const group=new THREE.Group();group.position.set(Math.sin(angle)*radius,0,Math.cos(angle)*radius)
        const color=m.id===r.member_id?0xdfbc84:0x9988ba
        const mat=new THREE.MeshStandardMaterial({color,roughness:.65});disposables.push(mat)
        const body=new THREE.Mesh(new THREE.CapsuleGeometry(.15,.28,4,10),mat);body.position.y=.48;group.add(body)
        const head=new THREE.Mesh(new THREE.SphereGeometry(.15,12,12),mat);head.position.y=.87;group.add(head)
        const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64
        const ctx=canvas.getContext('2d')
        if(ctx){ctx.fillStyle='#f1e5dc';ctx.font='24px sans-serif';ctx.textAlign='center';ctx.fillText(m.alias,128,40)}
        const texture=new THREE.CanvasTexture(canvas);disposables.push(texture)
        const sm=new THREE.SpriteMaterial({map:texture,transparent:true});disposables.push(sm)
        const label=new THREE.Sprite(sm);label.scale.set(1,.25,1);label.position.y=1.2;group.add(label)
        group.userData.member=m.id;seatGroup.add(group)
      })
    }
    const resize=()=>{const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h);camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix()}
    const ro=new ResizeObserver(resize);ro.observe(container);resize()
    let frame=0;const begun=performance.now()
    const animate=()=>{
      frame=requestAnimationFrame(animate);seats();const elapsed=(performance.now()-begun)/1000
      const r=latest.current;const focus=r.focus as {member_id?:string}|null
      const seat=seatGroup.children.find(x=>x.userData.member===focus?.member_id)
      const target=seat?Math.atan2(seat.position.x,seat.position.z):Math.sin(elapsed*.2)*.12
      tutor.rotation.y+=Math.atan2(Math.sin(target-tutor.rotation.y),Math.cos(target-tutor.rotation.y))*.04
      tutor.position.y=Math.min(.1,elapsed*.5-1.5)+Math.sin(elapsed*1.2)*.012
      tutor.visible=loaded;controls.update();renderer.render(scene,camera)
    };animate()
    return ()=>{disposed=true;cancelAnimationFrame(frame);ro.disconnect();controls.dispose();renderer.dispose();
      scene.traverse((o)=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const mats=Array.isArray(o.material)?o.material:[o.material];mats.forEach(m=>m.dispose())}})
      disposables.forEach(x=>x.dispose());renderer.domElement.remove()}
  },[])
  return <div className="r2-arena" ref={host} aria-label="共享教室舞台"><div className="r2-stage-caption">SOCRATES · 共思劇場</div></div>
}
