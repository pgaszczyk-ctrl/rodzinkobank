import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateScene,worldMatrices,transformPoint,scenePose,sampleCycle} from '../src/groszaki/scena.js';
const manifest=JSON.parse(readFileSync(new URL('../assets/groszaki/design/rynek/v4/manifest.json',import.meta.url)));

test('rig odrzuca cykl rodziców i nieznanego rodzica przed ładowaniem obrazów',()=>{
 for(const parentId of ['child','missing']) assert.throws(()=>validateScene({parts:[{id:'child',parentId,localPosition:[0,0]}]}));
 assert.equal(validateScene(manifest).size,manifest.parts.length);
});

test('punkt chwytu dziedziczy obrót i odbicie całego łańcucha',()=>{
 const m={parts:[{id:'parent',localPosition:[10,20],rotation:90,scaleX:-1},{id:'arm',parentId:'parent',localPosition:[4,0],rotation:0}]};
 const point=transformPoint(worldMatrices(m).get('arm'),[2,3]);
 assert.ok(Math.abs(point[0]-7)<1e-8);assert.ok(Math.abs(point[1]-14)<1e-8);
});

test('młotek nie zmienia pozycji podczas kontaktu, początek cyklu jest ciągły',()=>{
 const at=t=>worldMatrices(manifest,scenePose(manifest,t,true)).get('mlotek');
 assert.deepEqual(at(700),at(800));assert.deepEqual(at(800),at(920));
 const first=sampleCycle(manifest.repair,0,{held:true,repair:true});
 const last=sampleCycle(manifest.repair,1320,{held:true,repair:true});
 assert.equal(first.arm,last.arm);assert.equal(first.body,last.body);
});

test('jabłko podąża za dłonią z uwzględnieniem odbicia i zostaje po odłożeniu',()=>{
 for(const t of [500,800,1250]) {
  const pose=scenePose(manifest,t,true);
  const expected=transformPoint(worldMatrices(manifest,pose).get(manifest.seller.grip.parentId),manifest.seller.grip.offset);
  assert.deepEqual(pose.jablko.localPosition,expected);
 }
 assert.deepEqual(scenePose(manifest,1450,true).jablko.localPosition,scenePose(manifest,2080,true).jablko.localPosition);
});

const v5=JSON.parse(readFileSync(new URL('../assets/groszaki/design/rynek/v5/manifest.json',import.meta.url)));
test('v5: ręka, głowa i oba jabłka wracają do tego samego stanu na granicy pętli',()=>{
 validateScene(v5);
 const start=scenePose(v5,0,true),end=scenePose(v5,v5.seller.durationMs,true);
 for(const id of [v5.seller.grip.parentId,'glowa','jablko','jablko-na-ladzie']) assert.deepEqual(end[id],start[id]);
});
test('v5: odłożone jabłko zanika dopiero podczas wymiany i pojawia się następne',()=>{
 const opacity=t=>['jablko','jablko-na-ladzie'].map(id=>scenePose(v5,t,true)[id].opacity);
 assert.deepEqual(opacity(500),[1,0]);assert.deepEqual(opacity(1250),[0,1]);assert.deepEqual(opacity(2830),[0,1]);assert.deepEqual(opacity(3010),[0.5,0.5]);assert.deepEqual(opacity(3190),[1,0]);
});
test('v5: przechył głowy interpoluje również z klatek bez pola headTilt',()=>{
 assert.equal(scenePose(v5,2350,true).glowa.rotation,0);
 const tilt=scenePose(v5,2470,true).glowa.rotation;
 assert.ok(tilt>0 && tilt<8);
 assert.equal(scenePose(v5,2590,true).glowa.rotation,8);
});
