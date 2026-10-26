/** Bounded Playwright context capture and browser-independent HAR inspection. */
const SECRET = /^(?:authorization|proxy-authorization|cookie|set-cookie|password|passwd|.*secret.*|.*api[-_]?key.*|auth|authentication|.*token.*|.*session.*|sid|key|player[-_]?(?:guid|id)|user[-_]?name|login[-_]?name|credential[s]?|jwt|ticket)$/i;
const ACTIVITY = new Set(['fetch','xhr','websocket','eventsource','other']);
const REDACTED = '[REDACTED]';
const clone = value => structuredClone(value);
const headers = object => Object.entries(object ?? {}).map(([name,value]) => ({name,value:String(value)}));
const header = (list,name) => list?.find(h=>h.name.toLowerCase()===name)?.value ?? '';
const timestamp = entry => Date.parse(entry.startedDateTime) || 0;
const resource = entry => {const explicit=entry._resourceType??entry._resource?.type??entry.response?._resourceType;if(explicit)return explicit;if(isWS(entry))return 'websocket';const mime=entry.response?.content?.mimeType??'';if(/^image\//i.test(mime))return 'image';if(/^font\/|font|woff/i.test(mime))return 'font';if(/javascript/i.test(mime))return 'script';if(/text\/css/i.test(mime))return 'stylesheet';if(/^(audio|video)\//i.test(mime))return 'media';return 'other';};
const isWS = entry => Array.isArray(entry._webSocketMessages) || entry._resourceType==='websocket' || entry.response?.status===101 && /websocket/i.test(header(entry.response?.headers,'upgrade')) || /^(?:wss?):/i.test(entry.request?.url ?? '');
const asArray = value => value == null ? [] : Array.isArray(value) ? value : [value];
const clampInteger = (value, fallback, min=0, max=Number.MAX_SAFE_INTEGER) => Number.isFinite(Number(value)) ? Math.min(max,Math.max(min,Math.floor(Number(value)))) : fallback;
function cleanUrl(value) {
 try { const u=new URL(value);u.pathname=u.pathname.replace(/(\/socket\.io\/[^/]+\/websocket\/)[^/]+/i,'$1'+REDACTED).replace(/(\/(?:session|token|sid)\/)[^/]+/gi,'$1'+REDACTED);if(u.username)u.username=REDACTED;if(u.password)u.password=REDACTED;for(const key of [...u.searchParams.keys()])if(SECRET.test(key))u.searchParams.set(key,REDACTED);return u.href; }
 catch { return cleanText(String(value)); }
}
function cleanObject(value) {
 if(Array.isArray(value))return value.map(cleanObject);
 if(value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,SECRET.test(k)?REDACTED:cleanObject(v)]));
 return typeof value==='string'?cleanText(value):value;
}
function cleanText(text) {
 if(typeof text!=='string'||!text)return text;
 try { const parsed=JSON.parse(text); if(parsed && typeof parsed==='object')return JSON.stringify(cleanObject(parsed)); } catch {}
 if(/^[^=\s<&{}]+=[^\s]*$/.test(text)){const params=new URLSearchParams(text);for(const [key,value] of [...params])params.set(key,SECRET.test(key)?REDACTED:cleanText(value));return params.toString();}
 // Sniff content: mislabeled XML/form/JSON is common in game transports.
 return text.replace(/([\w:-]+)(\s*=\s*)(["'])(.*?)\3/gs,(all,k,sep,q,v)=>SECRET.test(k)?`${k}${sep}${q}${REDACTED}${q}`:all)
 .replace(/<([\w:-]+)(\s[^>]*)?>([\s\S]*?)<\/\1\s*>/g,(all,k,attrs='',v)=>SECRET.test(k)?`<${k}${attrs}>${REDACTED}</${k}>`:`<${k}${attrs}>${cleanXmlChildren(v)}</${k}>`)
 .replace(/<([\w:-]+)(\s[^>]*)?>([^<]*)$/g,(all,k,attrs='',v)=>SECRET.test(k)?`<${k}${attrs}>${REDACTED}`:all)
 .replace(/([\w:-]+)(\s*=\s*)(["'])([^"']*)$/g,(all,k,sep,q,v)=>SECRET.test(k)?`${k}${sep}${q}${REDACTED}`:all)
 .replace(/(["']?)([\w-]+)\1(\s*:\s*)(["'])([^"']*)(["']?)/g,(all,q,k,sep,q2,v,end)=>SECRET.test(k)?`${q}${k}${q}${sep}${q2}${REDACTED}${end||q2}`:all)
 .replace(/(^|[?&;\s])([^=\s&;]+)=([^&;\s]*)/g,(all,p,k,v)=>{let decoded=k;try{decoded=decodeURIComponent(k);}catch{}return SECRET.test(decoded)?`${p}${k}=${REDACTED}`:all;});
}
function cleanXmlChildren(text) {
 return text.replace(/<([\w:-]+)(\s[^>]*)?>([\s\S]*?)<\/\1\s*>/g,(all,k,attrs='',v)=>SECRET.test(k)?`<${k}${attrs}>${REDACTED}</${k}>`:`<${k}${attrs}>${cleanXmlChildren(v)}</${k}>`);
}
function cleanEncodedBody(body) {
 if(body?.text==null)return;
 if(body.encoding==='base64'){const decoded=Buffer.from(body.text,'base64');if(isTextBuffer(decoded))body.text=Buffer.from(cleanText(decoded.toString('utf8'))).toString('base64');}
 else body.text=cleanText(body.text);
}
function sanitizeEntry(e) {
 if(e.request?.url)e.request.url=cleanUrl(e.request.url);
 for(const side of [e.request,e.response]) {
  if(!side)continue;
  for(const h of side.headers ?? [])if(SECRET.test(h.name))h.value=REDACTED;else if(/^(?:location|referer|referrer)$/i.test(h.name))h.value=cleanUrl(h.value);
  for(const c of side.cookies ?? [])c.value=REDACTED;
  for(const q of side.queryString ?? [])if(SECRET.test(q.name))q.value=REDACTED;
  if(side.redirectURL)side.redirectURL=cleanUrl(side.redirectURL);
  if(side.postData){cleanEncodedBody(side.postData);for(const p of side.postData.params ?? [])p.value=SECRET.test(p.name)?REDACTED:cleanText(p.value);}
  cleanEncodedBody(side.content);
 }
 for(const f of e._webSocketMessages ?? [])if(f.data!=null && f.opcode!==2){const body={text:f.data,encoding:f.encoding};cleanEncodedBody(body);f.data=body.text;}
 if(e._error)e._error=cleanText(e._error);
 return e;
}
function omitBodies(e) {
 if(e.request?.postData){delete e.request.postData.text;delete e.request.postData.params;e.request.postData._bodyState='excluded-by-filter';}
 if(e.response?.content){delete e.response.content.text;delete e.response.content.encoding;e.response.content._bodyState='excluded-by-filter';}
 for(const f of e._webSocketMessages ?? []) {delete f.data;f._bodyState='excluded-by-filter';}
}
function matches(e,o) {
 const ws=isWS(e),r=resource(e),url=e.request?.url ?? '';
 if(o.preset==='ws'&&!ws)return false;
 if(o.preset==='activity'&&!ws&&!ACTIVITY.has(r))return false;
 if(o.transport==='http'&&ws||o.transport==='ws'&&!ws)return false;
 if(o.urlIncludes&&!url.includes(o.urlIncludes))return false;
 const domains=asArray(o.domains);if(domains.length){let hostname='';try{hostname=new URL(url).hostname;}catch{}if(!domains.some(d=>hostname===d || d.startsWith('*.')&&hostname.endsWith(d.slice(1))))return false;}
 const methods=asArray(o.methods).map(m=>m.toUpperCase());if(methods.length&&!methods.includes((e.request?.method??'').toUpperCase()))return false;
 if(asArray(o.resourceTypes).length&&!asArray(o.resourceTypes).includes(r))return false;
 if(o.statusMin!=null&&(e.response?.status??0)<o.statusMin||o.statusMax!=null&&(e.response?.status??0)>o.statusMax)return false;
 const time=timestamp(e);if(o.since!=null&&time<Number(o.since)||o.until!=null&&time>Number(o.until))return false;
 return true;
}
/** Pure filter. Accepts Firefox and Chromium HAR and retains unknown extensions. */
export function filterHar(har,options={}) {
 const out=clone(har);if(!out.log||!Array.isArray(out.log.entries))throw new TypeError('Expected HAR log.entries');
 const all=out.log.entries.filter(e=>matches(e,options)); const offset=clampInteger(options.offset,0);const limit=clampInteger(options.limit,all.length);
 out.log.entries=all.slice(offset,offset+limit).map(e=>{if(options.includeBodies===false||options.preset==='metadata')omitBodies(e);return options.redact===false?e:sanitizeEntry(e);});
 const binary=out.log.entries.some(e=>e._webSocketMessages?.some(f=>f.opcode===2&&f.data!=null)||[e.request?.postData,e.response?.content].some(b=>b?.encoding==='base64'&&b.text!=null&&!isTextBuffer(Buffer.from(b.text,'base64'))));
 out.log._redaction={enabled:options.redact!==false,complete:options.redact!==false&&!binary,binaryPayloads:binary?'preserved-uninspected':'none-detected',scope:'known sensitive keys in URLs, headers, cookies, JSON, forms, XML and text frames; opaque binary and unrecognized credential formats require explicit review'};
 out.log._filter={...out.log._filter,preset:options.preset??'full',transport:options.transport??'all',redacted:options.redact!==false,includeBodies:options.includeBodies!==false&&options.preset!=='metadata',total:all.length,offset,limit,returned:out.log.entries.length};
 // Page URLs can carry the same credentials as request URLs.
 if(options.redact!==false)for(const page of out.log.pages??[]) {if(page.title)page.title=cleanText(page.title);if(page._url)page._url=cleanUrl(page._url);}
 return out;
}
function schema(text,depth=0) {
 if(depth>4)return '…';
 if(typeof text==='string'){try{return schema(JSON.parse(text),depth);}catch{}if(/^\s*</.test(text))return {format:'xml',elements:[...new Set([...text.matchAll(/<([\w:-]+)(?:\s|>)/g)].map(m=>m[1]))].slice(0,40)};return {format:'text',length:text.length};}
 if(Array.isArray(text))return {type:'array',item:text.length?schema(text[0],depth+1):null};
 if(text&&typeof text==='object')return Object.fromEntries(Object.entries(text).slice(0,40).map(([k,v])=>[k,schema(v,depth+1)]));
 return text===null?'null':typeof text;
}
function endpointRows(entries) {
 const groups=new Map();for(const e of entries){let url=e.request?.url??'';try{const u=new URL(url);url=u.origin+u.pathname;}catch{}const key=`${e.request?.method??'GET'} ${url}`;
 let row=groups.get(key);if(!row){row={method:e.request?.method??'GET',url,count:0,statuses:{},resourceTypes:[],transports:[],requestSchema:null,responseSchema:null,frames:0};groups.set(key,row);}row.count++;const status=e.response?.status??0;row.statuses[status]=(row.statuses[status]??0)+1;const r=resource(e);if(!row.resourceTypes.includes(r))row.resourceTypes.push(r);const transport=isWS(e)?'ws':'http';if(!row.transports.includes(transport))row.transports.push(transport);row.frames+=e._webSocketMessages?.length??0;
 if(!row.requestSchema&&e.request?.postData?.text)row.requestSchema=e.request.postData.encoding==='base64'?{format:'binary',encoding:'base64'}:schema(e.request.postData.text);
 if(!row.responseSchema&&e.response?.content?.text)row.responseSchema=e.response.content.encoding==='base64'?{format:'binary',encoding:'base64'}:schema(e.response.content.text);
 }return [...groups.values()].sort((a,b)=>b.count-a.count);
}
/** Rendering/protocol hints only, based on explicit URL or payload evidence. */
export function detectFamily(har) {
 const entries=Array.isArray(har)?har:har?.log?.entries??[];const evidence=[];const families=new Set();
 for(const e of entries){const url=e.request?.url??'';for(const [family,re] of [['phaser',/\bphaser(?:[.-]|\/)/i],['pixi',/\bpixi(?:[.-]|\/)/i],['unity',/\.unityweb(?:\?|$)|UnityLoader|UnityFramework|\/Build\/.*\.wasm/i],['cocos',/cocos|cocos2d/i]])if(re.test(url)){families.add(family);if(evidence.length<20)evidence.push({family,source:'request-url',url:cleanUrl(url)});}}
 return {family:families.size===1?[...families][0]:families.size?'mixed':'unknown',evidence,limitations:['Transport data alone does not establish game action semantics or complete rendering technology.']};
}
export function summarizeHar(har,options={}) {
 const filtered=filterHar(har,options),es=filtered.log.entries;const webSockets=es.filter(isWS).length;
 return {entries:es.length,http:es.length-webSockets,webSockets,webSocketFrames:es.reduce((n,e)=>n+(e._webSocketMessages?.length??0),0),webSocketFrameEvidence:webSockets?(es.some(e=>e._webSocketMessages?.length)?'frames-present':'handshakes-only-or-no-exported-frames'):'no-websocket-evidence-in-har',failed:es.filter(e=>e._error||e._state==='failed'||!isWS(e)&&e.response?.status===0).length,bytes:es.reduce((n,e)=>n+Math.max(0,e.response?.bodySize??e.response?.content?.size??0),0),endpoints:endpointRows(es).slice(0,clampInteger(options.limit,100,0,1000)),family:detectFamily(filtered),capture:filtered.log._capture??null};
}

export class NetworkRecorder {
 constructor({maxEntries=10000,maxBodyBytes=262144,maxWebSocketFrames=10000,maxTotalBodyBytes=67108864,captureBodies='activity'}={}) {
  if(!['activity','all','none'].includes(captureBodies))throw new TypeError('captureBodies must be activity, all or none');
  this.limits={maxEntries:clampInteger(maxEntries,10000,1),maxBodyBytes:clampInteger(maxBodyBytes,262144),maxWebSocketFrames:clampInteger(maxWebSocketFrames,10000),maxTotalBodyBytes:clampInteger(maxTotalBodyBytes,67108864)};this.captureBodies=captureBodies;this.entries=[];this.requests=new WeakMap();this.requestRefs=new Map();this.pending=new Set();this.inflight=new Map();this.flushTimeouts=0;this.listeners=new Set();this.entryCleanup=new Map();this.pages=new WeakSet();this.sequence=0;this.action=null;this.context=null;this.disposed=false;this.losses={evictedEntries:0,evictedFrames:0,droppedFrames:0,truncatedBodies:0,omittedBodies:0,bodyErrors:0};this.frameCount=0;this.retainedBodyBytes=0;
 }
 _listen(emitter,event,fn){emitter.on(event,fn);const off=()=>{emitter.off(event,fn);this.listeners.delete(off);};this.listeners.add(off);return off;}
 _track(work){const p=Promise.resolve(work).catch(()=>{this.losses.bodyErrors++;}).finally(()=>this.pending.delete(p));this.pending.add(p);return p;}
 _add(e){this.entries.push(e);while(this.entries.length>this.limits.maxEntries){const old=this.entries.shift();this.entryCleanup.get(old)?.();this.entryCleanup.delete(old);this._settle(old);this.retainedBodyBytes-=retainedBytes(old);const req=this.requestRefs.get(old)?.deref();if(req)this.requests.delete(req);this.requestRefs.delete(old);delete old._response;omitBodies(old);this.losses.evictedEntries++;this.losses.evictedFrames+=old._webSocketMessages?.length??0;this.frameCount-=old._webSocketMessages?.length??0;}return e;}
 _capture(e){return this.captureBodies==='all'||this.captureBodies==='activity'&&ACTIVITY.has(resource(e));}
 _body(buffer,target,{binary=false,entry=null}={}){
  const b=Buffer.isBuffer(buffer)?buffer:Buffer.from(buffer??'');target._originalBytes=b.length;
  if(entry&&!this.entries.includes(entry)){target._bodyState='entry-evicted';return;}
  const remaining=Math.max(0,this.limits.maxTotalBodyBytes-this.retainedBodyBytes);
  const budget=binary?Math.floor(remaining/4)*3:remaining;
  const length=Math.min(b.length,this.limits.maxBodyBytes,budget);
  if(b.length&&length===0){target._capturedBytes=0;target._bodyState='total-body-budget-exhausted';this.losses.omittedBodies++;return;}
  const part=b.subarray(0,length);target._bodyState='captured';
  if(binary){target.text=part.toString('base64');target.encoding='base64';target._capturedBytes=part.length;}
  else{target.text=new TextDecoder().decode(part,{stream:true});target._capturedBytes=Buffer.byteLength(target.text);}
  target._retainedBytes=Buffer.byteLength(target.text);this.retainedBodyBytes+=target._retainedBytes;
  if(b.length>target._capturedBytes){target._truncated=true;this.losses.truncatedBodies++;}
 }

 attach(context){if(this.disposed)throw new Error('Recorder disposed');if(this.context===context)return this;if(this.context)throw new Error('Recorder already attached');this.context=context;
  this._listen(context,'request',req=>this._onRequest(req));this._listen(context,'response',res=>this._onResponse(res));this._listen(context,'requestfinished',req=>this._onFinished(req));this._listen(context,'requestfailed',req=>this._onFailed(req));this._listen(context,'page',page=>this._page(page));for(const page of context.pages())this._page(page);return this;
 }
 _onRequest(req){const now=Date.now(),url=req.url(),method=req.method(),hs=headers(req.headers());let query=[];try{query=[...new URL(url).searchParams].map(([name,value])=>({name,value}));}catch{}
  const e=this._add({_id:`net-${++this.sequence}`,startedDateTime:new Date(now).toISOString(),time:0,request:{method,url,httpVersion:'unknown',headers:hs,queryString:query,cookies:[],headersSize:-1,bodySize:0},response:{status:0,statusText:'',httpVersion:'unknown',headers:[],cookies:[],content:{size:0,mimeType:'',_bodyState:'pending'},redirectURL:'',headersSize:-1,bodySize:-1},cache:{},timings:{blocked:-1,dns:-1,connect:-1,ssl:-1,send:0,wait:0,receive:0},_httpVersionSource:'not-exposed-by-playwright',_resourceType:req.resourceType(),_action:this.action?{...this.action}:null,_state:'pending'});this.requests.set(req,e);this.requestRefs.set(e,new WeakRef(req));let resolve;const promise=new Promise(done=>{resolve=done;});this.inflight.set(e,{promise,resolve});
  const body=req.postDataBuffer();if(body){e.request.bodySize=body.length;e.request.postData={mimeType:header(hs,'content-type'),_bodyState:'not-captured'};if(this._capture(e))this._body(body,e.request.postData,{binary:!isTextBuffer(body),entry:e});}
  if(req.allHeaders)this._track(req.allHeaders().then(h=>{e.request.headers=headers(h);}));
 }
 _onResponse(res){const req=res.request(),e=this.requests.get(req);if(!e)return;e.response.status=res.status();e.response.statusText=res.statusText();e.response.headers=headers(res.headers());e.response.content.mimeType=header(e.response.headers,'content-type');e.response.redirectURL=header(e.response.headers,'location');if(res.allHeaders)this._track(res.allHeaders().then(h=>{e.response.headers=headers(h);e.response.content.mimeType=header(e.response.headers,'content-type');e.response.redirectURL=header(e.response.headers,'location');}));e._response=res;
 }
 _settle(e){this.inflight.get(e)?.resolve();this.inflight.delete(e);}
 _onFinished(req){const e=this.requests.get(req);if(!e||e._finished)return;this._settle(e);e._finished=true;e._state='finished';this._timing(req,e);this._track((async()=>{if(req.sizes)try{const s=await req.sizes();e.request.headersSize=s.requestHeadersSize;e.request.bodySize=s.requestBodySize;e.response.headersSize=s.responseHeadersSize;e.response.bodySize=s.responseBodySize;e.response.content.size=s.responseBodySize;e._transferSize=s.responseHeadersSize+s.responseBodySize;}catch{}
   const res=e._response;if(!res){e.response.content._bodyState='unavailable';return;}if(!this._capture(e)){e.response.content._bodyState='not-captured';delete e._response;return;}if(!this.entries.includes(e)){delete e._response;return;}try{const declared=Number(header(e.response.headers,'content-length'));if(declared>Math.max(1048576,this.limits.maxBodyBytes*4)){e.response.content._originalBytes=declared;e.response.content._capturedBytes=0;e.response.content._bodyState='skipped-large-content-length';this.losses.omittedBodies++;return;}if(this.retainedBodyBytes>=this.limits.maxTotalBodyBytes){e.response.content._bodyState='total-body-budget-exhausted';this.losses.omittedBodies++;return;}const b=await res.body();e.response.content.size=b.length;this._body(b,e.response.content,{binary:!isTextBuffer(b),entry:e});}catch(err){e.response.content._bodyState='unavailable';e.response.content._bodyError=String(err.message??err);this.losses.bodyErrors++;}finally{delete e._response;}
  })());
 }
 _timing(req,e){e.time=Math.max(0,Date.now()-timestamp(e));try{const t=req.timing();if(t.startTime>0)e.startedDateTime=new Date(t.startTime).toISOString();const delta=(a,b)=>a>=0&&b>=a?b-a:-1;e.timings={blocked:-1,dns:delta(t.domainLookupStart,t.domainLookupEnd),connect:delta(t.connectStart,t.connectEnd),ssl:delta(t.secureConnectionStart,t.connectEnd),send:0,wait:Math.max(0,delta(t.requestStart,t.responseStart)),receive:Math.max(0,delta(t.responseStart,t.responseEnd))};if(t.responseEnd>=0)e.time=t.responseEnd;}catch{} }
 _onFailed(req){const e=this.requests.get(req);if(!e)return;this._settle(e);e._state='failed';e._error=req.failure()?.errorText??'Request failed';e.response.content._bodyState='unavailable';this._timing(req,e);delete e._response;}
 _page(page){if(this.pages.has(page))return;this.pages.add(page);this._listen(page,'websocket',ws=>this._websocket(ws));}
 _websocket(ws){const e=this._add({_id:`net-${++this.sequence}`,startedDateTime:new Date().toISOString(),time:0,request:{method:'GET',url:ws.url(),httpVersion:'unknown',headers:[],queryString:[],cookies:[],headersSize:-1,bodySize:0},response:{status:0,statusText:'',httpVersion:'unknown',headers:[],cookies:[],content:{size:0,mimeType:'',_bodyState:'websocket'},redirectURL:'',headersSize:-1,bodySize:0},cache:{},timings:{send:0,wait:0,receive:0},_resourceType:'websocket',_action:this.action?{...this.action}:null,_state:'connecting',_webSocketMessages:[],_webSocketMetadata:{handshakeHeaders:'unavailable-via-playwright-websocket-event',handshakeStatus:'unavailable-via-playwright-websocket-event',connectionEvidence:'socket-created-only'}});
  const frame=(type,event)=>{e._webSocketMetadata.connectionEvidence='frames-observed';if(e._state!=='failed')e._state='open';if(!this.entries.includes(e)||this.frameCount>=this.limits.maxWebSocketFrames){this.losses.droppedFrames++;return;}const binary=Buffer.isBuffer(event.payload),b=binary?event.payload:Buffer.from(String(event.payload));const target={type,time:Date.now()/1000,opcode:binary?2:1,size:b.length,_action:this.action?{...this.action}:null};if(this.captureBodies==='none')target._bodyState='not-captured';else{this._body(b,target,{binary,entry:e});target.data=target.text;delete target.text;}e._webSocketMessages.push(target);this.frameCount++;e.response.content.size+=type==='receive'?b.length:0;};
  const cleanup=[];const release=()=>{for(const off of cleanup)off();this.entryCleanup.delete(e);};cleanup.push(this._listen(ws,'framesent',event=>frame('send',event)),this._listen(ws,'framereceived',event=>frame('receive',event)),this._listen(ws,'socketerror',error=>{e._error=String(error);e._state='failed';}),this._listen(ws,'close',()=>{if(e._state!=='failed')e._state='closed';e.time=Date.now()-timestamp(e);e._closedDateTime=new Date().toISOString();release();}));this.entryCleanup.set(e,release);
 }
 async flush({timeoutMs=5000}={}){const deadline=Date.now()+Math.max(0,timeoutMs);while(this.pending.size||this.inflight.size){const remaining=deadline-Date.now();if(remaining<=0){this.flushTimeouts++;break;}let timer;const timeout=new Promise(resolve=>{timer=setTimeout(()=>resolve('timeout'),remaining);});const completed=await Promise.race([Promise.allSettled([...this.pending,...[...this.inflight.values()].map(i=>i.promise)]),timeout]);clearTimeout(timer);if(completed==='timeout'){this.flushTimeouts++;break;}}return {pending:this.pending.size,inflight:this.inflight.size,timedOut:this.pending.size>0||this.inflight.size>0};}
 mark(label){this.action={id:`action-${Date.now()}-${++this.sequence}`,label:String(label),timestamp:Date.now()};return {...this.action};}
 stats(){return {storedEntries:this.entries.length,httpEntries:this.entries.filter(e=>!isWS(e)).length,webSocketEntries:this.entries.filter(isWS).length,frames:this.frameCount,retainedBodyBytes:this.retainedBodyBytes,pending:this.pending.size,inflight:this.inflight.size,flushTimeouts:this.flushTimeouts,...this.losses,limits:{...this.limits},captureBodies:this.captureBodies};}
 _har(){return {log:{version:'1.2',creator:{name:'UMCP',version:'1.0.0'},entries:this.entries.map(e=>{const {_response,_finished,...safe}=e;return clone(safe);}),_capture:{captureBodies:this.captureBodies,limits:{...this.limits},losses:{...this.losses},complete:!Object.values(this.losses).some(Boolean)&&this.captureBodies==='all'&&this.pending.size===0&&this.inflight.size===0&&this.entries.every(e=>!isWS(e)&&!['pending','incomplete'].includes(e._state)),scope:'available captured traffic; Playwright omits HTTP protocol version and WS handshake status/headers; a websocket creation event alone does not prove upgrade success. Unknown-length responses are materialized by response.body() before truncation; payload retention has a global byte budget, but temporary API allocations are not bounded by it',pendingEntries:this.entries.filter(e=>e._state==='pending').length,flushTimeouts:this.flushTimeouts}}};}
 exportHar(options={}){return filterHar(this._har(),options);}
 query(options={}){const limit=clampInteger(options.limit,100,0,1000),offset=clampInteger(options.offset,0);const filtered=filterHar(this._har(),{...options,limit,offset,includeBodies:false});return {entries:filtered.log.entries.map(e=>({id:e._id,url:e.request.url,method:e.request.method,status:e.response.status,resourceType:resource(e),transport:isWS(e)?'ws':'http',startedDateTime:e.startedDateTime,time:e.time,bytes:e.response.bodySize,frames:e._webSocketMessages?.length??0,state:e._state,error:e._error,action:e._action})),total:filtered.log._filter.total,offset,limit,stats:this.stats()};}
 detail(id,options={}){const e=this.entries.find(e=>e._id===id);if(!e)return null;const {_response,_finished,...safe}=e;return filterHar({log:{version:'1.2',creator:{name:'UMCP',version:'1.0.0'},entries:[safe]}},options).log.entries[0]??null;}
 endpoints(options={}){const har=this.exportHar({...options,limit:undefined,offset:undefined});const rows=endpointRows(har.log.entries),offset=clampInteger(options.offset,0),limit=clampInteger(options.limit,100,0,1000);return {endpoints:rows.slice(offset,offset+limit),total:rows.length,offset,limit};}
 async dispose(){if(this.disposed)return;await this.flush();for(const off of this.listeners)off();this.entryCleanup.clear();for(const e of this.entries)if(e._state==='pending'){e._state='incomplete';e.response.content._bodyState='unavailable-at-dispose';delete e._response;}for(const e of this.inflight.keys())this._settle(e);this.requestRefs.clear();this.requests=new WeakMap();this.disposed=true;this.context=null;}
}
function isTextBuffer(b){if(!b.length)return true;try{new TextDecoder('utf-8',{fatal:true}).decode(b);return !b.includes(0);}catch{return false;}}

function retainedBytes(e){return (e.request?.postData?._retainedBytes??0)+(e.response?.content?._retainedBytes??0)+(e._webSocketMessages??[]).reduce((sum,f)=>sum+(f._retainedBytes??0),0);}
