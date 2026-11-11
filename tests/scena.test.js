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
