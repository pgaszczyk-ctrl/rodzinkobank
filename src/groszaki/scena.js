// Wspólny odczyt rigu i animacji dla prób grafiki. Bez zależności od DOM.
const identity = () => [1, 0, 0, 1, 0, 0];
export function multiply(a, b) {
  return [a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5]];
}
export function transformPoint(matrix, [x, y]) {
  return [matrix[0]*x+matrix[2]*y+matrix[4], matrix[1]*x+matrix[3]*y+matrix[5]];
}
export function validateScene(manifest) {
  const ids = new Map();
  for (const part of manifest.parts) {
    if (ids.has(part.id)) throw new Error('Powtórzony element: '+part.id);
    ids.set(part.id, part);
    if (!part.localPosition?.every(Number.isFinite) || part.localPosition.length !== 2) throw new Error('Brak pozycji: '+part.id);
    if (part.src && (!part.sourceSize?.every(n=>n>0) || !part.worldSize?.every(n=>n>0) || !part.pivot?.every(Number.isFinite))) throw new Error('Niepełne wymiary: '+part.id);
  }
  const visited = new Set();
  const visiting = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error('Cykl rodziców: '+id);
    const part = ids.get(id);
    if (!part) throw new Error('Nieznany rodzic: '+id);
    visiting.add(id);
    if (part.parentId) visit(part.parentId);
    visiting.delete(id); visited.add(id);
  }
  for (const id of ids.keys()) visit(id);
  for (const cycle of [manifest.repair, manifest.seller].filter(Boolean)) {
    if (!(cycle.durationMs>0) || cycle.keyframes.length<2 || cycle.keyframes[0].ms!==0 || cycle.keyframes.at(-1).ms!==cycle.durationMs) throw new Error('Niepełny cykl animacji');
    for(let i=1;i<cycle.keyframes.length;i++) if(cycle.keyframes[i].ms<=cycle.keyframes[i-1].ms) throw new Error('Nieprawidłowa kolejność klatek');
  }
  return ids;
}

export function worldMatrices(manifest, overrides = {}) {
  const parts = new Map(manifest.parts.map(p=>[p.id,p]));
  const matrices = new Map();
  const pending = new Set();
  function calculate(id) {
    if(matrices.has(id)) return matrices.get(id);
    if(pending.has(id)) throw new Error('Cykl rodziców: '+id);
    const part = parts.get(id);
    if(!part) throw new Error('Nieznany element: '+id);
    pending.add(id);
    const pose = {...part, ...overrides[id]};
    const [x,y]=pose.localPosition;
    const angle=(pose.rotation || 0)*Math.PI/180;
    const sx=pose.scaleX ?? 1;
    const local=[Math.cos(angle)*sx,Math.sin(angle)*sx,-Math.sin(angle),Math.cos(angle),x,y];
    const matrix=multiply(part.parentId ? calculate(part.parentId) : identity(), local);
    matrices.set(id,matrix); pending.delete(id);
    return matrix;
  }
  for(const id of parts.keys()) calculate(id);
  return matrices;
}

const smooth = t=>t*t*(3-2*t);
export function sampleCycle(cycle, time, {held = false, repair = false} = {}) {
  const frames=cycle.keyframes;
  const ms=held ? Math.max(0,Math.min(time,cycle.durationMs)) : ((time%cycle.durationMs)+cycle.durationMs)%cycle.durationMs;
  const end=frames.findIndex((f,i)=>i>0 && ms<f.ms);
  if(end<0) return {...frames.at(-1)};
  const a=frames[end-1], b=frames[end];
  const fraction=(ms-a.ms)/(b.ms-a.ms);
  const t=repair && end===2 ? fraction*fraction : smooth(fraction);
  const result={...a};
  for(const key of new Set([...Object.keys(a),...Object.keys(b)])) {
    if(key==='head' || key==='ms') continue;
    const av=a[key] ?? 0, bv=b[key] ?? 0;
    if(typeof av==='number' && typeof bv==='number') result[key]=av+(bv-av)*t;
  }
  return result;
}

export function scenePose(manifest, time, held = false) {
  const overrides={};
  if(manifest.repair) {
    const r=sampleCycle(manifest.repair,time,{held,repair:true});
    overrides.korpus={rotation:r.body}; overrides['reka-prawa']={rotation:r.arm};
  }
  if(manifest.seller) {
    const cycle=manifest.seller;
    const s=sampleCycle(cycle,time,{held});
    overrides[cycle.grip.parentId]={rotation:s.angle};
    const head=manifest.parts.find(p=>p.id==='glowa');
    overrides.glowa={src:s.head ? head.alternateSrc : head.src,rotation:s.headTilt ?? 0};
    const ms=held ? Math.min(Math.max(time,0),cycle.durationMs) : ((time%cycle.durationMs)+cycle.durationMs)%cycle.durationMs;
    const onCounter=ms>=cycle.dropMs;
    const gripTime=cycle.appleReset && onCounter ? cycle.pickupMs : Math.max(cycle.pickupMs,Math.min(ms,cycle.dropMs));
    const gripPose=sampleCycle(cycle,gripTime,{held:true});
    const matrices=worldMatrices(manifest,{...overrides,[cycle.grip.parentId]:{rotation:gripPose.angle}});
    const position=transformPoint(matrices.get(cycle.grip.parentId),cycle.grip.offset);
    overrides.jablko={localPosition:position};
    if(cycle.appleReset) {
      const reset=cycle.appleReset;
      const fade=smooth(Math.max(0,Math.min(1,(ms-reset.startMs)/(reset.endMs-reset.startMs))));
      const dropPose=sampleCycle(cycle,cycle.dropMs,{held:true});
      const dropMatrices=worldMatrices(manifest,{...overrides,[cycle.grip.parentId]:{rotation:dropPose.angle}});
      overrides[reset.basketId]={localPosition:position,opacity:onCounter ? fade : 1};
      overrides[reset.counterId]={localPosition:transformPoint(dropMatrices.get(cycle.grip.parentId),cycle.grip.offset),opacity:onCounter ? 1-fade : 0};
    }
  }
  return overrides;
}

export class CanvasScene {
  static async load(manifestUrl) {
    const url=new URL(manifestUrl, document.baseURI);
    const response=await fetch(url);
    if(!response.ok) throw new Error('Nie można wczytać manifestu: '+response.status);
    const manifest=await response.json(); validateScene(manifest);
    const sources=new Set([manifest.map,...manifest.parts.flatMap(p=>[p.src,p.alternateSrc])].filter(Boolean));
    const images=new Map();
    await Promise.all([...sources].map(async src=>{
      const image=new Image(); image.src=new URL(src,url).href;
      await image.decode(); images.set(src,image);
    }));
    for(const part of manifest.parts) if(part.src) {
      const image=images.get(part.src);
      if(image.naturalWidth!==part.sourceSize[0] || image.naturalHeight!==part.sourceSize[1]) throw new Error('Rozmiar pliku niezgodny z manifestem: '+part.id);
    }
    return new CanvasScene(manifest, images);
  }
  constructor(manifest,images) { this.manifest=manifest;this.images=images; }
  draw(ctx,time,{held=false,camera=this.manifest.cameras.rynek,width,height,showOccluder=true}={}) {
    const [x,y,w,h]=camera;
    ctx.save();ctx.clearRect(0,0,width,height);ctx.scale(width/w,height/h);ctx.translate(-x,-y);
    ctx.drawImage(this.images.get(this.manifest.map),0,0,...this.manifest.worldSize);
    const pose=scenePose(this.manifest,time,held);
    const matrices=worldMatrices(this.manifest,pose);
    const hidden=new Set();
    for(const part of this.manifest.parts) {
      if(part.visible===false || hidden.has(part.parentId) || (!showOccluder && part.id===this.manifest.stall?.occluder)) {hidden.add(part.id);continue;}
      const src=pose[part.id]?.src ?? part.src;
      if(!src) continue;
      const [sw,sh]=part.sourceSize,[pw,ph]=part.worldSize,[px,py]=part.pivot;
      ctx.save();ctx.transform(...matrices.get(part.id));ctx.globalAlpha *= pose[part.id]?.opacity ?? part.opacity ?? 1;
      ctx.drawImage(this.images.get(src),-px*pw/sw,-py*ph/sh,pw,ph);ctx.restore();
    }
    ctx.restore();
  }
}
