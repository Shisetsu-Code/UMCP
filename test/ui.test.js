import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import * as ui from '../src/ui.js';

let browser;
before(async () => { browser = await chromium.launch({ headless: true, executablePath: process.env.UMCP_EXECUTABLE_PATH }); });
after(async () => { await browser?.close(); });
async function fixture(t, body) {
  const context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  await ui.installInstrumentation(context);
  const page = await context.newPage();
  t.after(() => context.close());
  await page.goto('data:text/html,' + encodeURIComponent(body));
  return page;
}

test('UI API exports executable entry points', () => {
  for (const name of ['installInstrumentation', 'detectUI', 'observeStable', 'validateControl']) assert.equal(typeof ui[name], 'function');
});

test('reflected iframes and rotated DOM ancestors require vision instead of publishing wrong coordinates',async t=>{
  const page=await fixture(t,'<div id="container"><iframe id="frame" style="position:absolute;left:100px;top:100px;width:400px;height:200px;border:0;transform:scaleX(-1)"></iframe></div>');
  const child=page.frames().find(f=>f!==page.mainFrame());
  await child.setContent('<button style="position:absolute;left:20px;top:30px;width:80px;height:40px">Reflected</button>');
  let result=await ui.detectUI(page);
  assert.ok(!result.controls.some(c=>c.label==='Reflected'));
  assert.equal(result.needsVision,true);
  await page.evaluate(()=>{document.querySelector('#frame').style.transform='none';document.querySelector('#container').style.transform='rotate(15deg)';});
  result=await ui.detectUI(page);
  assert.ok(!result.controls.some(c=>c.label==='Reflected'));
  assert.equal(result.needsVision,true);
});

test('DOM detection excludes hidden, disabled, offscreen and covered controls and finds open shadow DOM/listeners', async t => {
  const page = await fixture(t, `<style>button{position:absolute;width:100px;height:30px}#shown{left:40px;top:50px}#covered{left:200px;top:50px}</style>
    <button id="shown">Spin</button><button style="display:none">Hidden</button><button disabled style="top:100px">Disabled</button>
    <button style="left:900px">Offscreen</button><button id="covered">Covered</button><div style="position:absolute;left:200px;top:50px;width:100px;height:30px;background:red;z-index:2"></div>
    <div id="listen" style="position:absolute;left:40px;top:150px;width:90px;height:30px">Listener</div><div id="host"></div>
    <script>document.querySelector('#listen').addEventListener('pointerdown',()=>{});document.querySelector('#host').attachShadow({mode:'open'}).innerHTML='<button style="position:absolute;left:40px;top:210px;width:100px;height:30px">Shadow</button>';</script>`);
  const result = await ui.detectUI(page);
  assert.deepEqual(result.controls.map(c => c.label).sort(), ['Listener', 'Shadow', 'Spin']);
  const spin = result.controls.find(c => c.label === 'Spin');
  assert.deepEqual([spin.x, spin.y, spin.width, spin.height], [40, 50, 100, 30]);
  assert.deepEqual(spin.center, { x:90, y:65 });
  assert.deepEqual(spin.normalized, { x:90/800, y:65/600 });
  assert.equal(spin.id, (await ui.detectUI(page)).controls.find(c => c.label === 'Spin').id);
  assert.equal(await ui.validateControl(page, spin), true);
  await page.locator('#shown').evaluate(el => { el.textContent='Changed'; });
  assert.equal(await ui.validateControl(page, spin), false);
});

test('nested iframe controls use main viewport CSS coordinates and respect iframe occlusion', async t => {
  const page = await fixture(t, `<iframe id="outer" style="position:absolute;left:100px;top:120px;width:400px;height:300px;border:5px solid"></iframe>`);
  const outer = page.frames()[1];
  await outer.setContent(`<iframe style="position:absolute;left:20px;top:30px;width:200px;height:150px;border:3px solid"></iframe>`);
  await outer.childFrames()[0].setContent(`<button style="position:absolute;left:10px;top:15px;width:80px;height:25px">Inner</button>`);
  const result=await ui.detectUI(page);
  const inner=result.controls.find(c=>c.label==='Inner');
  assert.ok(inner);
  assert.deepEqual([inner.x,inner.y,inner.width,inner.height], [138,173,80,25]);
  await page.evaluate(()=>{const cover=document.createElement('div');cover.style='position:absolute;left:100px;top:120px;width:410px;height:310px;z-index:10;background:red';document.body.append(cover);});
  assert.equal((await ui.detectUI(page)).controls.some(c=>c.label==='Inner'),false);
});

test('canvas text remains observation, opaque canvas requests vision and listener removal preserves behavior', async t => {
  const page=await fixture(t, `<canvas id="canvas" width="300" height="150" style="position:absolute;left:100px;top:80px;width:600px;height:300px"></canvas><div id="removed" style="width:100px;height:30px">Removed</div><script>
    const canvas=document.querySelector('canvas');const ctx=canvas.getContext('2d');ctx.fillText('SPIN',20,40);let calls=0;const f=()=>calls++;document.querySelector('#removed').addEventListener('click',f);document.querySelector('#removed').removeEventListener('click',f);document.querySelector('#removed').click();window.calls=calls;
    </script>`);
  const result=await ui.detectUI(page);
  assert.equal(result.needsVision,true);
  assert.equal(result.canvases.length,1);
  assert.equal(result.controls.some(c=>['SPIN','Removed'].includes(c.label)),false);
  assert.ok(result.canvases[0].text.some(c=>c.label==='SPIN'));
  assert.equal(await page.evaluate(()=>window.calls),0);
});

test('accessible Pixi scene reports interactive bounds while engine signature alone does not imply a scene', async t=>{
  const page=await fixture(t, `<canvas width="400" height="300" style="position:absolute;left:100px;top:80px;width:400px;height:300px"></canvas><script>
    window.PIXI={VERSION:'fixture'};window.createjs={Sound:{}};
    window.app={stage:{visible:true,children:[{name:'Engine Spin',eventMode:'static',visible:true,worldVisible:true,worldAlpha:1,children:[],getBounds(){return {x:30,y:40,width:80,height:50}}}]},renderer:{canvas:document.querySelector('canvas'),screen:{width:400,height:300}}};
    Object.defineProperty(window,'dangerous',{get(){throw new Error('must not execute')}});
    </script>`);
  const result=await ui.detectUI(page);
  const control=result.controls.find(c=>c.label==='Engine Spin');
  assert.ok(control);
  assert.equal(control.source,'engine');
  assert.deepEqual([control.x,control.y,control.width,control.height],[130,120,80,50]);
  assert.ok(result.engines.some(e=>e.name==='PixiJS'&&e.sceneAccessible));
  assert.equal(result.engines.some(e=>e.name==='CreateJS'&&e.sceneAccessible),false);
  // Even an accessible scene does not establish full canvas coverage.
  assert.equal(result.needsVision,true);
});

test('stability compares every sample and rejects moved, replaced and relabeled targets', async t=>{
  const page=await fixture(t, `<button id="moving" style="position:absolute;left:10px;top:10px">Moving</button><button id="fixed" style="position:absolute;left:300px;top:50px">Fixed</button>`);
  const first=(await ui.detectUI(page)).controls.find(c=>c.label==='Moving');
  await page.evaluate(()=>{let x=10;window.moveTimer=setInterval(()=>{x+=10;document.querySelector('#moving').style.left=x+'px'},20)});
  const result=await ui.observeStable(page,{samples:3,intervalMs:60,tolerancePx:3});
  await page.evaluate(()=>clearInterval(window.moveTimer));
  assert.equal(result.stable,false);
  assert.equal(result.samples,3);
  assert.ok(result.controls.some(c=>c.label==='Fixed'));
  assert.equal(result.controls.some(c=>c.label==='Moving'),false);
  assert.equal(await ui.validateControl(page,first),false);
  const fixed=result.controls.find(c=>c.label==='Fixed');
  await page.locator('#fixed').evaluate(el=>{el.outerHTML=el.outerHTML});
  assert.equal(await ui.validateControl(page,fixed),false);
  await page.goto('data:text/html,<button>Fixed</button>');
  assert.equal(await ui.validateControl(page,fixed),false);
});

test('stable reports exact requested timing and validates option limits',async t=>{
  const page=await fixture(t,'<button>Static</button>');
  const result=await ui.observeStable(page,{samples:3,intervalMs:5});
  assert.equal(result.stable,true);assert.equal(result.samples,3);assert.equal(result.controls.length,1);
  assert.ok(result.timing.elapsedMs>=10);
  assert.equal((await ui.detectUI(page,{maxControls:0})).controls.length,0);
  await assert.rejects(()=>ui.observeStable(page,{samples:0}),/samples/);
});

test('scaled iframe maps child CSS pixels to main viewport and refuses a rotated frame',async t=>{
  const page=await fixture(t,`<iframe style="position:absolute;left:100px;top:100px;width:200px;height:150px;border:0;transform:scale(1.5);transform-origin:top left"></iframe>`);
  await page.frames()[1].setContent('<button style="position:absolute;left:20px;top:30px;width:80px;height:40px">Scaled</button>');
  const control=(await ui.detectUI(page)).controls.find(c=>c.label==='Scaled');
  assert.deepEqual([control.x,control.y,control.width,control.height],[130,145,120,60]);
  await page.locator('iframe').evaluate(el=>el.style.transform='rotate(20deg)');
  const result=await ui.detectUI(page);assert.equal(result.controls.length,0);assert.equal(result.needsVision,true);assert.ok(result.warnings.some(w=>w.includes('Rotated')));
});

test('scene data adapters cover Pixi bounds getters, Phaser input and CreateJS coordinates without executing accessors',async t=>{
  const page=await fixture(t,`<canvas width="600" height="400" style="position:absolute;left:20px;top:30px"></canvas><script>
    const canvas=document.querySelector('canvas'); window.getterReads=0;
    const bounds={minX:40,minY:50,maxX:140,maxY:80};Object.defineProperty(bounds,'width',{get(){window.getterReads++;return 100}});
    window.app={renderer:{canvas,screen:{width:600,height:400}},stage:{children:[{name:'Pixi getter bounds',_eventMode:'static',getBounds(){return bounds}}]}};
    window.game={canvas,scale:{gameSize:{width:600,height:400}},scene:{scenes:[{sys:{settings:{active:true,visible:true}},cameras:{main:{zoom:1,scrollX:10,scrollY:20}},children:{list:[{name:'Phaser button',input:{enabled:true},getBounds(){return {x:210,y:120,width:50,height:30}}}]}}]}};
    window.stage={canvas,children:[{name:'CreateJS button',mouseEnabled:true,_listeners:{click:[()=>{}]},getBounds(){return {x:0,y:0,width:60,height:20}},localToGlobal(x,y){return {x:x+400,y:y+200}}}]};
    </script>`);
  const result=await ui.detectUI(page);
  assert.deepEqual(result.controls.map(c=>c.label).sort(),['CreateJS button','Phaser button','Pixi getter bounds']);
  assert.equal(await page.evaluate(()=>window.getterReads),0);
  assert.deepEqual(result.controls.find(c=>c.label==='Phaser button').center,{x:245,y:145});
  assert.deepEqual(result.controls.find(c=>c.label==='CreateJS button').center,{x:450,y:240});
});

test('stability rejects sample motion that exceeds tolerance even when last position is midway',async t=>{
  const page=await fixture(t,`<button id="jitter" style="position:absolute;left:10px;top:10px;width:100px;height:30px">Jitter</button><script>
    const button=document.querySelector('button');let reads=0;const original=button.getBoundingClientRect.bind(button);button.getBoundingClientRect=()=>{const box=original();return {x:[10,16,13][Math.min(reads++,2)],y:box.y,width:box.width,height:box.height}};
    </script>`);
  const result=await ui.observeStable(page,{samples:3,intervalMs:1,tolerancePx:3});
  assert.equal(result.stable,false);assert.equal(result.controls.length,0);
});

test('instrumentation preserves native option getters and does not coerce clearRect arguments twice',async t=>{
  const page=await fixture(t,`<button id="target">Target</button><canvas></canvas>`);
  const result=await page.evaluate(()=>{
    const el=document.querySelector('button');let reads=0,calls=0;
    const options=new Proxy({capture:false},{get(target,key){if(key==='capture')reads++;return Reflect.get(target,key)},getOwnPropertyDescriptor(){throw new Error('metadata access must be ignored')}});
    let threw=false;try{el.addEventListener('click',()=>calls++,options)}catch{threw=true}el.click();
    let coercions=0;const x={valueOf(){coercions++;return 0}};document.querySelector('canvas').getContext('2d').clearRect(x,0,10,10);
    return {reads,calls,threw,coercions};
  });
  assert.deepEqual(result,{reads:1,calls:1,threw:false,coercions:1});
});

test('plain DOM launch errors expose visible text without inventing controls or revealing hidden source/form values',async t=>{
  const page=await fixture(t,`<main>missing/invalid launch parameters</main><p>Loading game…</p>
    <span style="display:none">hidden-secret</span><script>window.privateSource='source-secret'</script><style>.private-source{color:red}</style>
    <input value="input-secret"><input type="password" value="password-secret"><textarea>textarea-secret</textarea>`);
  const result=await ui.detectUI(page,{maxControls:0});
  assert.equal(result.controls.length,0);assert.equal(result.canvases.length,0);
  assert.ok(Array.isArray(result.visibleText));assert.equal(result.visibleText.length,1);
  assert.equal(result.visibleText[0].frameIndex,0);assert.equal(result.visibleText[0].frameUrl,page.url());
  assert.match(result.visibleText[0].text,/missing\/invalid launch parameters/);assert.match(result.visibleText[0].text,/Loading game/);
  assert.doesNotMatch(result.visibleText[0].text,/hidden-secret|source-secret|input-secret|password-secret|textarea-secret|private-source/);
});

test('visible text output shares a total budget across frames and reports per-frame/aggregate truncation',async t=>{
  const page=await fixture(t,'<main>'+('A'.repeat(1300))+'</main>'+Array.from({length:9},()=>'<iframe style="width:120px;height:30px"></iframe>').join(''));
  for(const frame of page.frames().slice(1))await frame.setContent('<main>'+('B'.repeat(1300))+'</main>');
  const result=await ui.detectUI(page);
  assert.ok(result.visibleText.length>1);
  assert.equal(result.visibleText.reduce((sum,entry)=>sum+entry.text.length,0),8000);
  assert.ok(result.visibleText.every(entry=>entry.text.length<=1000));
  assert.ok(result.visibleText.some(entry=>entry.truncated));
  assert.ok(result.warnings.some(w=>w.includes('Visible text')&&w.includes('1000')));
  assert.ok(result.warnings.some(w=>w.includes('Visible text')&&w.includes('8000')));
});

test('truncated page text preserves stable controls while actual control limits still prevent stability',async t=>{
  const page=await fixture(t,'<button>Stable action</button><p>'+('Visible prose. '.repeat(120))+'</p>');
  const result=await ui.observeStable(page,{samples:3,intervalMs:1});
  assert.equal(result.stable,true);
  assert.equal(result.controls.length,1);
  assert.equal(result.controls[0].label,'Stable action');
  assert.equal(result.visibleText[0].text.length,1000);
  assert.equal(result.visibleText[0].truncated,true);
  assert.ok(result.warnings.some(w=>w.includes('Visible text output limited')));
  // Omitted text can still benefit from vision independently of control stability.
  assert.equal(result.needsVision,true);
  await page.evaluate(()=>{const button=document.createElement('button');button.textContent='Another action';document.body.prepend(button)});
  const limited=await ui.observeStable(page,{samples:3,intervalMs:1,maxControls:1});
  assert.equal(limited.stable,false);
  assert.ok(limited.warnings.some(w=>w.includes('Control output limited')));
});

test('declarative click spans expose delegated launch controls and reveal a popup canvas on real click',async t=>{
  const page=await fixture(t,`<span id="launch" style="display:inline-block;width:120px;height:40px" data-interactions='[{"trigger":"click","action":"show","target":"popup","templateId":"39577"}]'>Play Demo</span>
    <span data-interactions='[{"trigger":"pointerdown"}]'>Pointer down</span><span data-interactions='[{"trigger":"pointerup"}]'>Pointer up</span>
    <span data-interactions='not valid json'>Malformed declaration</span>
    <span data-interactions='[{"trigger":"mouseover","action":"show"}]'>Hover only</span>
    <span aria-disabled="true" data-interactions='[{"trigger":"pointerdown"}]'>Disabled declaration</span>
    <span style="display:none" data-interactions='[{"trigger":"pointerup"}]'>Hidden declaration</span>
    <span id="covered-declaration" style="position:absolute;left:300px;top:100px;width:100px;height:30px" data-interactions='[{"trigger":"click"}]'>Covered declaration</span><div style="position:absolute;left:300px;top:100px;width:100px;height:30px;z-index:2;background:red"></div>
    <div id="popup" style="visibility:hidden;pointer-events:none"><canvas width="400" height="250"></canvas></div>
    <script>document.addEventListener('click',event=>{if(event.target.closest('#launch')){const popup=document.querySelector('#popup');popup.style.visibility='visible';popup.style.pointerEvents='auto'}})</script>`);
  const initial=await ui.detectUI(page);
  assert.deepEqual(initial.controls.map(c=>c.label),['Play Demo','Pointer down','Pointer up']);
  assert.equal(initial.canvases.length,0);
  const launch=initial.controls[0];assert.equal(launch.source,'dom');assert.ok(launch.confidence<0.8);
  await page.mouse.click(launch.center.x,launch.center.y);
  const opened=await ui.detectUI(page);
  assert.equal(opened.canvases.length,1);assert.equal(opened.needsVision,true);
});
