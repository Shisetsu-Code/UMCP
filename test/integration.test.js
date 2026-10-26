import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserService } from '../src/browser.js';
import { startFixture } from './fixture-server.js';

test('network snapshots stay responsive while a long-lived HTTP response is pending',{timeout:30000},async()=>{
  const fixture=await startFixture();const service=new BrowserService({headless:true});
  try{
    const opened=await service.open({url:fixture.url+'/?hold=1'});
    for(let i=0;i<100&&!fixture.received.some(r=>r.path==='/api/hold');i++)await new Promise(r=>setTimeout(r,10));
    assert.ok(fixture.received.some(r=>r.path==='/api/hold'));
    const start=performance.now();
    const stats=await service.network({sessionId:opened.sessionId,operation:'stats'});
    const listing=await service.network({sessionId:opened.sessionId,operation:'query'});
    assert.ok(performance.now()-start<1000,'Read-only network snapshots must not wait 5s for a long poll');
    assert.ok(stats.inflight>0);assert.ok(listing.entries.some(e=>e.url.endsWith('/api/hold')));
  }finally{await fixture.close();await service.shutdown();}
});

test('browser observes, clicks scaled images, measures HTTP/WS, filters HAR and rejects stale targets', {timeout:60000}, async()=>{
  const fixture=await startFixture();const dir=await mkdtemp(join(tmpdir(),'umcp-integration-'));
  const service=new BrowserService({headless:true,artifactDir:dir});
  try{
    const opened=await service.open({url:fixture.url,viewport:{width:1280,height:720},captureBodies:'all'});
    const sessionId=opened.sessionId;
    const obs=await service.observe({sessionId,samples:1});
    const spin=obs.controls.find(c=>c.label==='Test action');assert.ok(spin,'actual DOM control found');
    assert.ok(obs.controls.some(c=>c.label==='Shadow control'),'shadow DOM found');
    assert.ok(obs.controls.some(c=>c.label==='Frame control'),'cross-origin frame found');
    assert.ok(!obs.controls.some(c=>c.label==='Hidden trap'));
    const shot=await service.screenshot({sessionId,maxWidth:640,format:'jpeg',quality:30});
    assert.equal(shot.width,640); assert.equal(shot.transform.region.width,1280);
    await service.act({sessionId,kind:'click',x:spin.center.x/2,y:spin.center.y/2,coordinateSpace:'image',screenshotId:shot.screenshotId});
    const fresh=await service.observe({sessionId,samples:1});
    assert.notEqual(fresh.observationId,obs.observationId);
    await assert.rejects(service.act({sessionId,kind:'click',controlId:spin.id,observationId:obs.observationId}),/stale/i);
    const nowSpin=fresh.controls.find(c=>c.label==='Test action');
    await service.act({sessionId,kind:'click',controlId:nowSpin.id,observationId:fresh.observationId});
    assert.equal(fixture.received.filter(r=>r.path==='/api/spin').length,2);
    await service.network({sessionId,operation:'flush'});
    const net=await service.network({sessionId,operation:'query',transport:'all',limit:100});
    assert.ok(net.entries.length>=8);
    const endpoints=await service.network({sessionId,operation:'endpoints'});assert.ok(JSON.stringify(endpoints).includes('/api/spin'));
    const exported=await service.exportHar({sessionId,preset:'activity',includeBodies:true,redact:true});
    const har=JSON.parse(await readFile(exported.path,'utf8'));
    assert.equal(har.log.version,'1.2');assert.ok(har.log.entries.some(e=>e.request.url.includes('/api/spin')));
    assert.ok(!har.log.entries.some(e=>e.request.url.includes('/asset.svg')));
    assert.ok(!JSON.stringify(har).includes('fixture-secret'));
    assert.ok(har.log.entries.some(e=>e._webSocketMessages?.some(m=>m.type==='send')),'WS sent frames retained');
    await service.navigate({sessionId,url:fixture.url+'/next'});
    await assert.rejects(service.act({sessionId,kind:'click',x:10,y:10,coordinateSpace:'image',screenshotId:shot.screenshotId}),/stale/i);
  } finally {await service.shutdown();await fixture.close();await rm(dir,{recursive:true,force:true});}
});

test('manual controls, page switching and session isolation', {timeout:45000},async()=>{
  const fixture=await startFixture();const dir=await mkdtemp(join(tmpdir(),'umcp-sessions-'));const service=new BrowserService({headless:true,artifactDir:dir});
  try{
    const one=await service.open({url:fixture.url});const two=await service.open({url:fixture.url+'/next'});
    await service.markControls({sessionId:one.sessionId,controls:[{label:'Canvas centre',x:700,y:340,width:120,height:80}]});
    const obs=await service.observe({sessionId:one.sessionId,samples:1});assert.ok(obs.controls.some(c=>c.source==='manual'));
    await service.act({sessionId:one.sessionId,kind:'click',controlId:obs.controls.find(c=>c.label==='Open popup').id,observationId:obs.observationId});
    const afterAction=await service.observe({sessionId:one.sessionId,samples:1});
    assert.ok(!afterAction.controls.some(c=>c.source==='manual'),'inputs expire caller-identified regions');
    const pages=await service.pages({sessionId:one.sessionId});assert.equal(pages.pages.length,2);
    const secondObs=await service.observe({sessionId:two.sessionId,samples:1});assert.ok(secondObs.controls.some(c=>c.label==='Next page'));assert.ok(!secondObs.controls.some(c=>c.source==='manual'));
    await service.close({sessionId:one.sessionId});assert.equal((await service.sessions()).sessions.length,1);
  }finally{await service.shutdown();await fixture.close();await rm(dir,{recursive:true,force:true});}
});
