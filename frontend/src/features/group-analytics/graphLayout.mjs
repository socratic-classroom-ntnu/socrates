/** Bounded deterministic force relaxation; node order is source sequence. */
export function forceLayout(nodes,edges,width=600,height=380){
 const points=nodes.map((n,i)=>({id:n.id,x:width/2+Math.cos(i*2.399963)*Math.min(width,height)*.3,y:height/2+Math.sin(i*2.399963)*Math.min(width,height)*.3}));
 const byId=new Map(points.map((p,i)=>[p.id,i]));const links=edges.map(e=>[byId.get(e.source),byId.get(e.target)]).filter(e=>e.every(i=>i!==undefined));
 for(let step=0;step<110;step++){
  const force=points.map(p=>({x:(width/2-p.x)*.014,y:(height/2-p.y)*.014}));
  for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){
   const dx=points[i].x-points[j].x,dy=points[i].y-points[j].y,d2=Math.max(100,dx*dx+dy*dy),scale=1600/d2;
   force[i].x+=dx*scale;force[i].y+=dy*scale;force[j].x-=dx*scale;force[j].y-=dy*scale;
  }
  for(const [i,j]of links){const dx=points[j].x-points[i].x,dy=points[j].y-points[i].y,d=Math.max(1,Math.hypot(dx,dy)),scale=(d-75)/d*.11;force[i].x+=dx*scale;force[i].y+=dy*scale;force[j].x-=dx*scale;force[j].y-=dy*scale}
  const cap=7*(1-step/125);points.forEach((p,i)=>{p.x=Math.max(16,Math.min(width-16,p.x+Math.max(-cap,Math.min(cap,force[i].x))));p.y=Math.max(16,Math.min(height-16,p.y+Math.max(-cap,Math.min(cap,force[i].y))))});
 }
 return new Map(points.map(p=>[p.id,[p.x,p.y]]));
}
