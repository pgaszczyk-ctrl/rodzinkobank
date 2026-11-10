// Jeden łagodny podmuch steruje trawą, liśćmi, dymem i skrzydłami młyna.
export function windAt(now) {
  const t = now / 1000;
  return 0.65 + Math.sin(t * 0.23) * 0.35 + Math.sin(t * 0.61) * 0.16;
}
const GRASS = [[136,287],[344,280],[373,368],[98,491],[176,688],[444,790],[497,812],[734,953],[1010,710],[1070,685],[1165,707],[1485,334],[1575,390],[1665,540],[1717,862],[1832,935],[1930,585],[1310,1020],[814,371],[897,367]];
const SKY = { autumn: ['#ffeab2','#ffeab2'], summer: ['#b4e2e8','#bedfe0'], spring: ['#c7e8ed','#cce8e8'], winter: ['#d6e5eb','#dce8eb'] };
export function drawLandscape(ctx, now, angle, season, still) {
  const wind = still ? 0 : windAt(now);
  // Mapa zawiera nieruchome skrzydła. Odtwarzamy ich niewielki obszar nieba
  // i wieżę, a następnie rysujemy tylko jeden, obracający się wirnik.
  ctx.save();
  const sky = SKY[season] || SKY.autumn;
  const gradient = ctx.createLinearGradient(0,80,0,225);gradient.addColorStop(0,sky[0]);gradient.addColorStop(1,sky[1]);
  ctx.fillStyle=gradient;
  ctx.beginPath();ctx.moveTo(177,103);ctx.lineTo(203,103);ctx.lineTo(242,132);ctx.lineTo(276,88);ctx.lineTo(300,102);ctx.lineTo(270,154);ctx.lineTo(318,184);ctx.lineTo(308,208);ctx.lineTo(267,182);ctx.lineTo(227,225);ctx.lineTo(197,216);ctx.lineTo(225,170);ctx.lineTo(177,132);ctx.closePath();ctx.fill();
  ctx.strokeStyle='#805337';ctx.lineWidth=2;ctx.fillStyle='#bf9665';
  ctx.beginPath();ctx.moveTo(230,157);ctx.lineTo(268,157);ctx.lineTo(280,225);ctx.quadraticCurveTo(250,240,209,225);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#987248';ctx.beginPath();ctx.moveTo(212,164);ctx.quadraticCurveTo(246,111,278,163);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.fillStyle='#74543c';ctx.beginPath();ctx.roundRect(249,202,8,14,3);ctx.fill();
  ctx.translate(247,157);ctx.rotate(angle-0.95);
  for(let i=0;i<4;i++) {
    ctx.rotate(Math.PI/2);ctx.fillStyle='#f2d9a2';ctx.strokeStyle='#8b593b';ctx.lineWidth=1.6;
    ctx.fillRect(13,-9,61,17);ctx.strokeRect(13,-9,61,17);
    ctx.lineWidth=0.8;ctx.beginPath();ctx.moveTo(13,0);ctx.lineTo(74,0);
    for(let j=19;j<74;j+=9){ctx.moveTo(j,-8);ctx.lineTo(j,8);}ctx.stroke();
  }
  ctx.fillStyle='#9f714a';ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
  if(season !== 'winter') {
    ctx.save();ctx.strokeStyle=season==='autumn'?'#a38a43':'#758d43';ctx.lineWidth=1.5;ctx.lineCap='round';
    for(const [x,y] of GRASS) {
      const sway=wind*3+ (still?0:Math.sin(now/1100+x)*2);
      for(let i=-1;i<=1;i++) {ctx.beginPath();ctx.moveTo(x+i*3,y);ctx.quadraticCurveTo(x+i*4+sway*0.4,y-5,x+i*5+sway,y-10-Math.abs(i)*2);ctx.stroke();}
    }
    ctx.restore();
  }
  // Krótkie, zanikające smugi na wodzie dają spokojny ruch nurtu.
  ctx.save();ctx.strokeStyle='rgba(237,255,250,.36)';ctx.lineWidth=1.5;
  for(const [x,y] of [[1462,522],[1525,615],[1360,915],[1622,1030],[119,622],[166,405]]) {
    const drift=still?0:((now/180+x)%18);
    ctx.beginPath();ctx.moveTo(x,y+drift);ctx.quadraticCurveTo(x+9,y+4+drift,x+17,y+5+drift);ctx.stroke();
  }
  ctx.restore();
}
