// Małe scenki przy istniejących drogach. Nie zmieniają pieniędzy ani liczby Groszaków.
import { makeRoute, routePosition } from './trasy.js';

const JOBS = {
  piekarnia: { action: 'knead', text: 'Pomagam piekarzowi wyrabiać ciasto', color: '#f6e6bf', role: 'piekarz' },
  'stragan-a': { action: 'hammer', text: 'Naprawiam skrzynkę dla sprzedawczyni', color: '#a76e86', role: 'sprzedawczyni' },
  'stragan-b': { action: 'sack', text: 'Podnoszę worek z jabłkami na targu', color: '#738b59', role: 'sadownik' },
  'stragan-c': { action: 'hammer', text: 'Naprawiam ladę na warzywa', color: '#be8254', role: 'sprzedawca' },
  mlyn: { action: 'sack', text: 'Pomagam młynarzowi nosić worki mąki', color: '#dfcfab', role: 'młynarz' },
  stodola: { action: 'hammer', text: 'Naprawiam skrzynie w stodole', color: '#7296a3', role: 'gospodarz' },
  dynie: { action: 'sack', text: 'Zbieram plony razem z rolniczką', color: '#aa7152', role: 'rolniczka' },
  podworze: { action: 'sack', text: 'Układam worki z ziarnem na farmie', color: '#8b9861', role: 'rolnik' },
};
export const jobFor = (id) => JOBS[id] || JOBS['stragan-a'];

export class TownLife {
  constructor(graph) { this.setGraph(graph); }
  setGraph(graph) {
    this.graph = graph;
    this.residents = graph.places.praca.map((place, i) => {
      const node = graph.nodes.get(place.punkt);
      const next = graph.adj.get(place.punkt)?.[0]?.to || place.punkt;
      return { place, job: jobFor(place.punkt), node, route: makeRoute(graph, [place.punkt, next]),
        seed: i * 2.37, x: node.x, y: node.y, size: 30, dir: 1 };
    });
  }
  items(now, entities, still) {
    const items = [];
    for (const resident of this.residents) {
      const { node, place, seed, route } = resident;
      const helpers = entities.filter(e => e.state === 'working' && e.workPlace?.punkt === place.punkt);
      // Podejście do Groszaka, postój i powrót; cała droga pozostaje na sieci tras.
      const time = still ? 0 : now / 1000;
      const cycle = (time + seed) % 18;
      const distance = Math.min(route.length, 45) * (cycle < 6 ? cycle / 6 : cycle < 12 ? 1 : (18 - cycle) / 6);
      const pos = routePosition(route, helpers.length ? 0 : distance, -0.7);
      Object.assign(resident, pos, { dir: helpers.length ? -1 : cycle < 12 ? 1 : -1, helping: helpers.length > 0 });
      items.push({ x: node.x + 17, y: node.y + 3, size: 34,
        draw: ctx => drawStation(ctx, node.x + 17, node.y + 3, resident.job, helpers.length > 0, time + seed) });
      items.push({ ...resident, draw: ctx => drawResident(ctx, resident, time + seed, still) });
    }
    return items;
  }
}

function drawStation(ctx, x, y, job, active, time) {
  ctx.save(); ctx.translate(x, y); ctx.lineWidth = 1.4; ctx.strokeStyle = '#7c5336';
  if (job.action === 'sack') {
    for (let i = 0; i < 2; i++) {
      ctx.fillStyle = i ? '#d0a969' : '#e0bd81'; ctx.beginPath();
      ctx.ellipse(i * 10, -7 - i * 3, 8, 10, -0.15, 0, Math.PI * 2); ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.moveTo(i * 10 - 5, -14 - i * 3);ctx.lineTo(i * 10 + 4, -14 - i * 3);ctx.stroke();
    }
  } else {
    ctx.fillStyle = '#bf8e56';ctx.fillRect(-9, -17, 23, 13);ctx.strokeRect(-9, -17, 23, 13);
    ctx.beginPath();ctx.moveTo(-6,-4);ctx.lineTo(-6,2);ctx.moveTo(11,-4);ctx.lineTo(11,2);ctx.stroke();
    ctx.beginPath();ctx.moveTo(-8,-10);ctx.lineTo(13,-10);ctx.stroke();
    if (job.action === 'knead') { ctx.fillStyle='#f8df9b';ctx.beginPath();ctx.ellipse(1,-18,8,3,0,0,Math.PI*2);ctx.fill(); }
    if (active && job.action === 'hammer' && Math.sin(time * Math.PI * 1.7) > 0.85) {
      ctx.strokeStyle='#ffe3a0';ctx.lineWidth=2;
      for(let i=0;i<3;i++) {ctx.beginPath();ctx.moveTo(0,-22);ctx.lineTo(-7+i*8,-30-Math.sin(i)*3);ctx.stroke();}
    }
  }
  ctx.restore();
}

function drawResident(ctx, r, time, still) {
  const moving = !still && !r.helping;
  const stride = moving ? Math.sin(time * 5) * 3 : 0;
  const wave = !still && r.helping ? Math.sin(time * 3) * 0.2 : 0;
  ctx.save();ctx.translate(r.x, r.y);ctx.scale(r.size / 30, r.size / 30);
  ctx.fillStyle='rgba(70,40,20,.15)';ctx.beginPath();ctx.ellipse(0,0,8,2.5,0,0,Math.PI*2);ctx.fill();
  ctx.lineCap='round';ctx.strokeStyle='#624934';ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(-3,-9);ctx.lineTo(-4+stride,0);ctx.moveTo(3,-9);ctx.lineTo(4-stride,0);ctx.stroke();
  ctx.translate(0,moving ? -Math.abs(stride)*0.35 : 0);
  ctx.fillStyle=r.job.color;ctx.strokeStyle='#72513b';ctx.lineWidth=1.2;
  ctx.beginPath();ctx.roundRect(-7,-23,14,16,4);ctx.fill();ctx.stroke();
  ctx.fillStyle='#f0cc9a';ctx.beginPath();ctx.arc(0,-29,6.5,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle=r.job.role==='piekarz' ? '#fff3d9' : '#aa7949';
  ctx.beginPath();ctx.ellipse(0,-35,9,3.8,0,0,Math.PI*2);ctx.fill();ctx.stroke();
  ctx.fillStyle='#49372b';ctx.beginPath();ctx.arc(r.dir*2,-29,0.8,0,Math.PI*2);ctx.fill();
  ctx.strokeStyle='#72513b';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-6,-20);ctx.lineTo(-10,-12+stride);
  ctx.moveTo(6,-20);ctx.lineTo(r.helping ? 13 : 10,r.helping ? -28+wave*10 : -12-stride);ctx.stroke();
  ctx.fillStyle='#eddfbc';ctx.fillRect(-4,-20,8,11);
  if(r.helping) { // małe serduszko wdzięczności, bez tekstu zasłaniającego mapę
    ctx.fillStyle='#bf6b53';ctx.font='10px sans-serif';ctx.fillText('♥',10,-39+(still?0:Math.sin(time*2)*2));
  }
  ctx.restore();
}
