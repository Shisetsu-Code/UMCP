import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { NetworkRecorder, filterHar, summarizeHar, detectFamily } from '../src/network.js';

const entry = (overrides={}) => ({ startedDateTime:'2026-10-26T12:00:00.000Z',time:10,request:{method:'POST',url:'https://demo.test/play?session=SECRET&game=foo',httpVersion:'HTTP/1.1',headers:[{name:'Authorization',value:'Bearer SECRET'},{name:'Cookie',value:'sid=SECRET'}],queryString:[{name:'session',value:'SECRET'}],cookies:[{name:'sid',value:'SECRET'}],headersSize:-1,bodySize:50,postData:{mimeType:'application/json',text:'{"token":"SECRET","round":{"sessionId":"SECRET","bet":1}}'}},response:{status:200,statusText:'OK',httpVersion:'HTTP/1.1',headers:[{name:'Set-Cookie',value:'sid=SECRET'}],cookies:[],content:{size:20,mimeType:'application/json',text:'{"balance":10,"authToken":"SECRET"}'},redirectURL:'',headersSize:-1,bodySize:20},cache:{},timings:{send:0,wait:10,receive:0},_resourceType:'fetch',...overrides});
const har = (...entries) => ({log:{version:'1.2',creator:{name:'test',version:'1'},entries}});

test('HAR filters redact URLs headers nested JSON and preserve raw input', () => {
 const input=har(entry(),entry({_resourceType:'image',request:{...entry().request,url:'https://cdn.test/image.png',method:'GET'}}));
 const result=filterHar(input,{preset:'activity',domains:['demo.test'],methods:['POST'],statusMin:200,statusMax:299});
 assert.equal(result.log.entries.length,1); assert.ok(!JSON.stringify(result).includes('SECRET')); assert.ok(JSON.stringify(input).includes('SECRET'));
 assert.equal(filterHar(input,{redact:false}).log.entries[0].request.headers[0].value,'Bearer SECRET');
 assert.equal(filterHar(input,{preset:'metadata'}).log.entries[0].response.content.text,undefined);
 assert.equal(filterHar(input,{since:Date.parse('2026-10-26T12:00:01Z')}).log.entries.length,0);
});

test('HAR WS frames preserve binary and sanitize text, form and XML payloads', () => {
 const ws=entry({_resourceType:'websocket',_webSocketMessages:[{type:'send',time:1,opcode:1,data:'{"session":"SECRET","spin":1}'},{type:'receive',time:2,opcode:2,data:'AAE=',encoding:'base64'}]});
 const form=entry(); form.request.postData={mimeType:'application/x-www-form-urlencoded',text:'token=SECRET&bet=1',params:[{name:'token',value:'SECRET'}]};
 const xml=entry(); xml.request.postData={mimeType:'text/xml',text:'<request session="SECRET"><token>SECRET</token><bet>1</bet></request>'};
 assert.ok(!JSON.stringify(filterHar(har(ws,form,xml))).includes('SECRET'));
 const out=filterHar(har(ws),{preset:'ws'}); assert.equal(out.log.entries[0]._webSocketMessages[1].data,'AAE=');
 assert.equal(filterHar(har(ws),{includeBodies:false}).log.entries[0]._webSocketMessages[0].data,undefined);
});

test('summary and family detection report evidence without inventing game operations', () => {
 const out=summarizeHar(har(entry(),entry({_resourceType:'websocket',_webSocketMessages:[]})));
 assert.equal(out.entries,2); assert.equal(out.webSockets,1); assert.ok(Array.isArray(out.endpoints));
 const family=detectFamily(har(entry())); assert.equal(family.family,'unknown'); assert.ok(Array.isArray(family.evidence));
 assert.equal(detectFamily(har(entry({request:{...entry().request,url:'https://cdn.test/phaser.min.js'}}))).family,'phaser');
});

function fixture() {
 const context=new EventEmitter(); context.pages=()=>[];
 const request=(url='https://demo.test/api',body='{"token":"SECRET","bet":1}',resource='fetch')=>({url:()=>url,method:()=> 'POST',resourceType:()=>resource,headers:()=>({'content-type':'application/json',authorization:'SECRET'}),allHeaders:async()=>({'content-type':'application/json',authorization:'SECRET'}),postDataBuffer:()=>Buffer.from(body),timing:()=>({startTime:Date.now(),domainLookupStart:-1,domainLookupEnd:-1,connectStart:-1,connectEnd:-1,secureConnectionStart:-1,requestStart:0,responseStart:2,responseEnd:3}),sizes:async()=>({requestBodySize:body.length,responseBodySize:50,responseHeadersSize:40,requestHeadersSize:30}),failure:()=>({errorText:'net::ERR_FAILED'})});
 const response=req=>({request:()=>req,status:()=>200,statusText:()=> 'OK',headers:()=>({'content-type':'application/json'}),allHeaders:async()=>({'content-type':'application/json'}),body:async()=>Buffer.from('{"token":"SECRET","value":"abcdefghijklmnopqrstuvwxyz"}'),serverAddr:async()=>({ipAddress:'127.0.0.1',port:443}),securityDetails:async()=>null});
 return {context,request,response};
}

test('recorder captures HTTP body limits, errors, action correlation and entry eviction', async()=>{
 const f=fixture(), r=new NetworkRecorder({maxEntries:2,maxBodyBytes:20,captureBodies:'all'}); r.attach(f.context); r.mark('spin');
 const one=f.request(); f.context.emit('request',one); f.context.emit('response',f.response(one)); f.context.emit('requestfinished',one); await r.flush();
 const first=r.query().entries[0]; assert.equal(first.action.label,'spin'); assert.equal(first.status,200); assert.equal(first.requestBody,undefined);
 const d=r.detail(first.id,{redact:false}); assert.equal(d.response.content._truncated,true); assert.equal(Buffer.byteLength(d.response.content.text),20);
 const failed=f.request('https://demo.test/fail'); f.context.emit('request',failed); f.context.emit('requestfailed',failed);
 const three=f.request('https://demo.test/three'); f.context.emit('request',three); f.context.emit('requestfailed',three); await r.flush();
 assert.equal(r.query().total,2); assert.equal(r.stats().evictedEntries,1); assert.ok(r.exportHar().log._capture.losses.truncatedBodies>=1);
 const fail=r.query({urlIncludes:'/fail'}).entries[0]; assert.equal(r.detail(fail.id)._error,'net::ERR_FAILED');
 await r.dispose(); assert.equal(f.context.listenerCount('request'),0);
});

test('recorder captures existing/new page WS text binary frames and bounded global loss',async()=>{
 const f=fixture(),page=new EventEmitter(); f.context.pages=()=>[page]; const r=new NetworkRecorder({maxWebSocketFrames:2}); r.attach(f.context);
 const ws=new EventEmitter(); ws.url=()=> 'wss://demo.test/socket?token=SECRET'; page.emit('websocket',ws);
 ws.emit('framesent',{payload:'{"token":"SECRET","round":1}'}); ws.emit('framereceived',{payload:Buffer.from([0,1,255])}); ws.emit('framereceived',{payload:'third'}); ws.emit('close');
 const exported=r.exportHar({preset:'ws'}); assert.equal(exported.log.entries.length,1); const frames=exported.log.entries[0]._webSocketMessages;
 assert.equal(frames.length,2); assert.equal(frames[1].encoding,'base64'); assert.equal(frames[1].data,'AAH/'); assert.ok(!JSON.stringify(exported).includes('SECRET')); assert.equal(r.stats().droppedFrames,1);
 await r.dispose(); assert.equal(page.listenerCount('websocket'),0);
});

test('captureBodies activity omits static payload and flush waits for response body',async()=>{
 const f=fixture(),r=new NetworkRecorder();r.attach(f.context);
 const req=f.request('https://demo.test/image.png','big','image');f.context.emit('request',req);f.context.emit('response',f.response(req));f.context.emit('requestfinished',req);await r.flush();
 assert.equal(r.detail(r.query().entries[0].id).response.content.text,undefined); assert.equal(r.detail(r.query().entries[0].id).response.content._bodyState,'not-captured');
 await r.dispose();
});

test('redaction covers base64 text HAR content, encoded XML JSON envelopes and truncated XML',()=>{
 const e=entry();e.response.content={size:20,mimeType:'application/json',encoding:'base64',text:Buffer.from('{"token":"SECRET","ok":true}').toString('base64')};
 e.request.postData.text=JSON.stringify({packet:{payload:'<Pkt sid="SECRET"><session>SECRET</session></Pkt>'}});
 const out=filterHar(har(e)).log.entries[0];assert.ok(!Buffer.from(out.response.content.text,'base64').toString().includes('SECRET'));assert.ok(!out.request.postData.text.includes('SECRET'));
 e.request.postData.text='<request><token>SECRET';assert.ok(!filterHar(har(e)).log.entries[0].request.postData.text.includes('SECRET'));
});

test('eviction and socket close release event listeners rather than accumulating unbounded objects',async()=>{
 const f=fixture(),page=new EventEmitter();f.context.pages=()=>[page];const r=new NetworkRecorder({maxEntries:1});r.attach(f.context);
 const a=new EventEmitter();a.url=()=> 'wss://demo.test/a';page.emit('websocket',a);
 const b=new EventEmitter();b.url=()=> 'wss://demo.test/b';page.emit('websocket',b);
 assert.equal(a.listenerCount('framesent'),0);b.emit('close');assert.equal(b.listenerCount('framesent'),0);
 await r.dispose();
});

test('Firefox metadata can infer static resource class and WS upgrades without Chrome extensions',()=>{
 const image=entry();delete image._resourceType;image.response.content.mimeType='image/png';
 const ws=entry();delete ws._resourceType;ws.response.status=101;ws.response.headers=[{name:'Upgrade',value:'websocket'}];ws.request.url='https://demo.test/socket';
 assert.equal(filterHar(har(image,ws),{preset:'activity'}).log.entries.length,1);
 assert.equal(filterHar(har(image,ws),{transport:'ws'}).log.entries.length,1);
});

test('nested JSON carried in form values and base64 JSON in text WS is sanitized',()=>{
 const e=entry();e.request.postData={mimeType:'application/x-www-form-urlencoded',text:'payload='+encodeURIComponent('{"token":"SECRET","bet":1}')};
 e._webSocketMessages=[{opcode:1,encoding:'base64',data:Buffer.from('{"token":"SECRET"}').toString('base64')}];
 const out=filterHar(har(e)).log.entries[0];assert.ok(!decodeURIComponent(out.request.postData.text).includes('SECRET'));assert.ok(!Buffer.from(out._webSocketMessages[0].data,'base64').toString().includes('SECRET'));
});

test('real Chromium HTTP JSON/form/XML, redirects, failures and text/binary WS across pages', {timeout:30000},async()=>{
 const {chromium}=await import('playwright');const {startFixture}=await import('./fixture-server.js');
 const fixture=await startFixture();const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});
 const context=await browser.newContext();const r=new NetworkRecorder({captureBodies:'all'});r.attach(context);
 try{const page=await context.newPage();await page.goto(fixture.url);await page.waitForFunction(()=>document.querySelector('#status'));
 await page.waitForTimeout(200);r.mark('fixture-action');await page.click('#spin');await page.waitForTimeout(100);
 await page.evaluate(async()=>{await fetch('/redirect');try{await fetch('http://127.0.0.1:1/unreachable');}catch{}});
 const extra=await context.newPage();await extra.goto(fixture.url+'/popup');await r.flush();
 const raw=r.exportHar({redact:false}),safe=r.exportHar();assert.ok(!JSON.stringify(safe).includes('fixture-secret'));
 for(const path of ['/api/init','/api/form','/api/xml','/api/spin','/api/popup'])assert.ok(raw.log.entries.some(e=>e.request.url.includes(path)&&e.response.content.text),`captures ${path}`);
 assert.ok(raw.log.entries.some(e=>e.response.status===302));assert.ok(raw.log.entries.some(e=>e._error));
 const ws=raw.log.entries.find(e=>e._webSocketMessages);assert.ok(ws);assert.equal(ws._webSocketMessages.length,4);assert.ok(ws._webSocketMessages.some(f=>f.encoding==='base64'&&f.data==='AAEC/w=='));
 const spin=raw.log.entries.find(e=>e.request.url.includes('/api/spin'));assert.equal(spin._action.label,'fixture-action');assert.ok(spin.response.bodySize>0);assert.ok(spin.time>=0);
 }finally{await context.close();await r.dispose();await browser.close();await fixture.close();}
});

test('flush drains HTTP requests already in flight before returning',async()=>{
 const f=fixture(),r=new NetworkRecorder({captureBodies:'all'});r.attach(f.context);const req=f.request();f.context.emit('request',req);
 const completion=setTimeout(()=>{f.context.emit('response',f.response(req));f.context.emit('requestfinished',req);},30);
 try{await r.flush();assert.equal(r.query().entries[0].status,200);assert.ok(r.detail(r.query().entries[0].id).response.content.text);}finally{clearTimeout(completion);await r.dispose();}
});

test('total retained payload budget bounds requests responses and WS payloads with explicit omissions',async()=>{
 const f=fixture(),r=new NetworkRecorder({maxTotalBodyBytes:30,captureBodies:'all'});r.attach(f.context);
 for(let i=0;i<3;i++){const req=f.request('https://demo.test/'+i);f.context.emit('request',req);f.context.emit('response',f.response(req));f.context.emit('requestfinished',req);}await r.flush();
 assert.ok(r.stats().retainedBodyBytes<=30);assert.ok(r.stats().omittedBodies>0);assert.equal(r.exportHar().log._capture.complete,false);await r.dispose();
});

test('capture discloses unknown HTTP version and uninspected binary redaction',async()=>{
 const f=fixture(),page=new EventEmitter();f.context.pages=()=>[page];const r=new NetworkRecorder();r.attach(f.context);const req=f.request();f.context.emit('request',req);f.context.emit('requestfailed',req);
 const ws=new EventEmitter();ws.url=()=> 'wss://demo.test/socket';page.emit('websocket',ws);ws.emit('framereceived',{payload:Buffer.from([0,1,255])});
 const out=r.exportHar();assert.equal(out.log.entries[0].request.httpVersion,'unknown');assert.equal(out.log._redaction.binaryPayloads,'preserved-uninspected');assert.equal(out.log._redaction.complete,false);await r.dispose();
});

test('large declared HTTP bodies are omitted before Playwright body materialization',async()=>{
 const f=fixture(),r=new NetworkRecorder({maxBodyBytes:20,captureBodies:'all'});r.attach(f.context);const req=f.request();f.context.emit('request',req);const res=f.response(req);let called=false;res.body=async()=>{called=true;return Buffer.alloc(2_000_000);};res.headers=()=>({'content-length':'2000000','content-type':'application/octet-stream'});res.allHeaders=async()=>res.headers();f.context.emit('response',res);f.context.emit('requestfinished',req);await r.flush();
 assert.equal(called,false);assert.equal(r.detail(r.query().entries[0].id).response.content._bodyState,'skipped-large-content-length');await r.dispose();
});

test('observed provider credential keys and Socket.IO connection IDs are redacted',()=>{
 const e=entry();e.request.url='wss://playtech.example/socket.io/1/websocket/fixture-secret?username=fixture-secret&loginname=fixture-secret';e.request.postData.text='{"key":"fixture-secret","playerguid":"fixture-secret"}';
 const out=filterHar(har(e));assert.ok(!JSON.stringify(out).includes('fixture-secret'));
 e.request.postData.text='<request key="fixture-secret';assert.ok(!filterHar(har(e)).log.entries[0].request.postData.text.includes('fixture-secret'));
});

test('flush timeout returns explicit pending capture rather than claiming completeness',async()=>{
 const f=fixture(),r=new NetworkRecorder({captureBodies:'all'});r.attach(f.context);const req=f.request();f.context.emit('request',req);
 const state=await r.flush({timeoutMs:5});assert.equal(state.timedOut,true);assert.equal(r.exportHar().log._capture.complete,false);f.context.emit('requestfailed',req);await r.dispose();
});

test('flush timeout while response body is pending does not claim complete capture',async()=>{
 const f=fixture(),r=new NetworkRecorder({captureBodies:'all'});r.attach(f.context);const req=f.request();f.context.emit('request',req);const res=f.response(req);let finish;res.body=()=>new Promise(resolve=>{finish=resolve;});f.context.emit('response',res);f.context.emit('requestfinished',req);
 await r.flush({timeoutMs:5});assert.equal(r.exportHar().log._capture.complete,false);finish(Buffer.from('ok'));await r.dispose();
});

test('default credential matching covers common prefixed API key and client secret names',()=>{
 const e=entry();e.request.headers.push({name:'X-Api-Key',value:'fixture-secret'});e.request.postData.text='{"clientSecret":"fixture-secret","auth":"fixture-secret","bet":1}';
 assert.ok(!JSON.stringify(filterHar(har(e))).includes('fixture-secret'));
});

test('WS handshake status is unknown and valid observed frames are not classified as failed',async()=>{
 const f=fixture(),page=new EventEmitter();f.context.pages=()=>[page];const r=new NetworkRecorder({captureBodies:'all'});r.attach(f.context);const ws=new EventEmitter();ws.url=()=> 'wss://demo.test/socket';page.emit('websocket',ws);ws.emit('framereceived',{payload:'hello'});ws.emit('close');
 const out=r.exportHar();assert.equal(out.log.entries[0].response.status,0);assert.equal(out.log.entries[0]._webSocketMetadata.connectionEvidence,'frames-observed');assert.equal(summarizeHar(out).failed,0);assert.equal(out.log._capture.complete,false);await r.dispose();
});

test('real rejected WebSocket upgrade never reports a successful HTTP handshake', {timeout:15000},async()=>{
 const {createServer}=await import('node:http');const {chromium}=await import('playwright');
 const server=createServer((req,res)=>res.end('ok'));server.on('upgrade',(req,socket)=>socket.end('HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n'));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox']});const context=await browser.newContext();const r=new NetworkRecorder({captureBodies:'all'});r.attach(context);
 try{const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}`);await page.evaluate(url=>new Promise(resolve=>{const ws=new WebSocket(url);ws.onerror=()=>resolve();ws.onclose=()=>resolve();}),`ws://127.0.0.1:${server.address().port}/denied`);await page.waitForTimeout(50);await r.flush();
 const entry=r.exportHar({preset:'ws'}).log.entries[0];assert.ok(entry);assert.equal(entry.response.status,0);assert.equal(entry._state,'failed');assert.match(entry._error,/403/);assert.equal(r.exportHar().log._capture.complete,false);assert.equal(summarizeHar(r.exportHar({preset:'ws'})).failed,1);
 }finally{await context.close();await r.dispose();await browser.close();await new Promise(resolve=>server.close(resolve));}
});
