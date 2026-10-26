import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { NetworkRecorder, filterHar, summarizeHar } from './network.js';
import { installInstrumentation, detectUI, observeStable, validateControl } from './ui.js';
import { renderImage, imageToViewport, normalizedToViewport } from './images.js';

const id=prefix=>`${prefix}_${randomUUID()}`;
const trimMap=(map,max)=>{while(map.size>max)map.delete(map.keys().next().value);};
const validUrl=value=>{
  if(value==='about:blank')return value;
  const u=new URL(value);if(!['http:','https:'].includes(u.protocol))throw new Error('Only http/https URLs and about:blank are supported');return u.href;
};
function viewportPoint(p,viewport){
  if(!Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.y<0||p.x>=viewport.width||p.y>=viewport.height)throw new Error('Coordinates outside viewport');
  return p;
}

/** Browser lifecycle and tool-level serialization. No observation loop runs in the background. */
export class BrowserService {
  constructor(options={}){
    this.options=options;
    this.artifactDir=resolve(options.artifactDir??process.env.UMCP_ARTIFACT_DIR??'artifacts');
    this._sessions=new Map();this._artifacts=new Map();this._browser=null;this._launch=null;this._headless=null;this._opening=0;
  }
  async _getBrowser(headless){
    const requested=headless??this.options.headless??(process.env.UMCP_HEADLESS==='true');
    if(this._browser){if(headless!==undefined&&requested!==this._headless)throw new Error('Browser already running with a different headless setting; close all sessions first');return this._browser;}
    if(!this._launch){
      this._headless=requested;
      this._launch=chromium.launch({headless:requested,executablePath:this.options.executablePath??process.env.UMCP_EXECUTABLE_PATH,args:['--disable-dev-shm-usage']}).then(browser=>{
        this._browser=browser;
        browser.on('disconnected',()=>{this._browser=null;for(const s of this._sessions.values())s.disconnected=true;});
        return browser;
      }).finally(()=>{this._launch=null;});
    }
    return this._launch;
  }
  _registerPage(session,page){
    if(session.pageRefs.has(page))return session.pageRefs.get(page);
    const record={id:id('page'),page,generation:0,manual:[],lastUrl:page.url()};
    session.pages.set(record.id,record);session.pageRefs.set(page,record);
    page.on('framenavigated',()=>{record.generation++;record.manual=[];record.lastUrl=page.url();});
    page.on('close',()=>{record.generation++;});
    if(!session.activePageId)session.activePageId=record.id;
    return record;
  }
  _session(sessionId){
    const s=this._sessions.get(sessionId);
    if(!s)throw new Error('Unknown or closed sessionId');
    if(s.disconnected)throw new Error('Browser disconnected; open a new session');
    return s;
  }
  async _run(args,operation){
    const s=this._session(args.sessionId);
    const task=s.queue.then(async()=>{
      if(s.closing)throw new Error('Session is closing');
      let p=s.pages.get(args.pageId??s.activePageId);
      if(!p||p.page.isClosed()){
        if(args.pageId)throw new Error('Unknown or closed pageId');
        p=[...s.pages.values()].find(r=>!r.page.isClosed());
        if(!p)throw new Error('Session has no open pages');
        s.activePageId=p.id;
      }
      return operation(s,p);
    });
    s.queue=task.catch(()=>{});
    return task;
  }
  async open(args={}){
    if(this._sessions.size+this._opening>=(this.options.maxSessions??8))throw new Error('Maximum sessions reached');
    const url=validUrl(args.url??'about:blank');
    const viewport=args.viewport??{width:1280,height:720};
    if(!Number.isInteger(viewport.width)||!Number.isInteger(viewport.height)||viewport.width<320||viewport.height<240||viewport.width>3840||viewport.height>2160)throw new Error('Viewport must be 320..3840 by 240..2160 CSS pixels');
    this._opening++;
    let context,session;
    try{
      const browser=await this._getBrowser(args.headless);
      context=await browser.newContext({viewport,deviceScaleFactor:1,ignoreHTTPSErrors:false,acceptDownloads:false});
      context.setDefaultTimeout(10000);context.setDefaultNavigationTimeout(args.timeoutMs??45000);
      await installInstrumentation(context);
      const network=new NetworkRecorder({captureBodies:args.captureBodies??'activity',maxBodyBytes:args.maxBodyBytes??262144,maxEntries:args.maxEntries??10000,maxWebSocketFrames:args.maxWebSocketFrames??10000});
      await network.attach(context);
      session={id:id('session'),context,network,pages:new Map(),pageRefs:new WeakMap(),activePageId:null,queue:Promise.resolve(),observations:new Map(),screenshots:new Map(),createdAt:Date.now(),closing:false};
      context.on('page',page=>this._registerPage(session,page));
      this._sessions.set(session.id,session);
      const page=await context.newPage();const p=this._registerPage(session,page);
      let navigationError=null;
      try{if(url!=='about:blank')await page.goto(url,{waitUntil:'domcontentloaded',timeout:args.timeoutMs??45000});}catch(error){navigationError=error.message;}
      return {sessionId:session.id,pageId:p.id,url:page.url(),title:await page.title().catch(()=>''),viewport,headless:this._headless,navigationError,network:network.stats()};
    }catch(error){
      if(session){this._sessions.delete(session.id);await session.network.dispose().catch(()=>{});}
      if(context)await context.close().catch(()=>{});
      if(!this._sessions.size&&this._browser){await this._browser.close().catch(()=>{});this._browser=null;}
      throw error;
    }finally{this._opening--;}
  }
  async sessions(){
    return {sessions:[...this._sessions.values()].map(s=>({sessionId:s.id,activePageId:s.activePageId,createdAt:s.createdAt,pages:[...s.pages.values()].filter(p=>!p.page.isClosed()).map(p=>({pageId:p.id,url:p.page.url()})),network:s.network.stats()}))};
  }
  async pages(args){
    return this._run(args,async(s)=>{
      if(args.selectPageId){const next=s.pages.get(args.selectPageId);if(!next||next.page.isClosed())throw new Error('Unknown or closed selectPageId');s.activePageId=next.id;await next.page.bringToFront();}
      return {sessionId:s.id,activePageId:s.activePageId,pages:await Promise.all([...s.pages.values()].filter(p=>!p.page.isClosed()).map(async p=>({pageId:p.id,url:p.page.url(),title:await p.page.title().catch(()=>''),active:p.id===s.activePageId})))};
    });
  }
  async navigate(args){
    return this._run(args,async(s,p)=>{
      p.generation++;p.manual=[];
      const mark=await s.network.mark(`navigate:${args.direction??'url'}`);
      const options={waitUntil:'domcontentloaded',timeout:args.timeoutMs??45000};
      let response;
      switch(args.direction){
        case 'back':response=await p.page.goBack(options);break;
        case 'forward':response=await p.page.goForward(options);break;
        case 'reload':response=await p.page.reload(options);break;
        default:response=await p.page.goto(validUrl(args.url),options);
      }
      return {sessionId:s.id,pageId:p.id,url:p.page.url(),status:response?.status()??null,mark};
    });
  }
  _manual(p,viewport){
    return p.manual.filter(m=>m.url===p.page.url()&&m.viewport.width===viewport.width&&m.viewport.height===viewport.height).map(m=>({...m,center:{x:m.x+m.width/2,y:m.y+m.height/2},normalized:{x:(m.x+m.width/2)/viewport.width,y:(m.y+m.height/2)/viewport.height},source:'manual',kind:'button',confidence:0.5,frameIndex:0,frameUrl:p.page.url()}));
  }
  async _observe(s,p,args){
    const begin=performance.now();
    const data=args.samples===1
      ? {...await detectUI(p.page,{maxControls:args.maxControls??200}),stable:null,samples:1,stabilityChecked:false}
      : {...await observeStable(p.page,{samples:args.samples??3,intervalMs:args.intervalMs??2000,tolerancePx:args.tolerancePx??3,maxControls:args.maxControls??200}),stabilityChecked:true};
    const viewport=p.page.viewportSize();
    const observation={...data,controls:[...data.controls,...this._manual(p,viewport)],observationId:id('obs'),sessionId:s.id,pageId:p.id,url:p.page.url(),viewport,capturedAt:Date.now(),expiresInMs:120000,durationMs:Math.round(performance.now()-begin),coordinateSpace:'viewport-css'};
    s.observations.set(observation.observationId,{observation,generation:p.generation,pageId:p.id});trimMap(s.observations,30);
    if(args.screenshot)observation.screenshot=await this._screenshot(s,p,{...args.image,controls:observation.controls});
    return observation;
  }
  async observe(args){return this._run(args,(s,p)=>this._observe(s,p,args));}
  async _artifact(buffer,{format,mimeType,prefix='capture'}){
    await mkdir(this.artifactDir,{recursive:true});
    const artifactId=id(prefix);const name=`${artifactId}.${format}`;const path=join(this.artifactDir,name);
    await writeFile(path,buffer,{flag:'wx',mode:0o600});
    const artifact={artifactId,name,path,uri:`umcp://artifacts/${artifactId}`,mimeType,bytes:buffer.length,createdAt:Date.now()};
    this._artifacts.set(artifactId,artifact);trimMap(this._artifacts,500);
    return artifact;
  }
  async _screenshot(s,p,args={}){
    const viewport=p.page.viewportSize();
    const region=args.clip??{x:0,y:0,width:viewport.width,height:viewport.height};
    if(![region.x,region.y,region.width,region.height].every(Number.isFinite)||region.x<0||region.y<0||region.width<1||region.height<1||region.x+region.width>viewport.width||region.y+region.height>viewport.height)throw new Error('Screenshot clip must be entirely inside viewport');
    let controls=args.controls;
    if(args.overlay&&!controls)controls=[...(await detectUI(p.page)).controls,...this._manual(p,viewport)];
    const raw=await p.page.screenshot({type:'png',clip:region,animations:'allow',timeout:15000});
    const result=await renderImage(raw,{...args,region,controls});
    const artifact=await this._artifact(result.buffer,{format:result.format,mimeType:result.mimeType,prefix:'image'});
    const screenshotId=id('shot');
    const {buffer,...metadata}=result;
    const shot={...metadata,...artifact,screenshotId,sessionId:s.id,pageId:p.id,url:p.page.url(),viewport,capturedAt:Date.now(),coordinateSpace:'image-pixels',overlayLegend:args.overlay?(controls??[]).map((c,i)=>({number:i+1,id:c.id,label:c.label,center:c.center})):undefined};
    s.screenshots.set(screenshotId,{shot,generation:p.generation,pageId:p.id});trimMap(s.screenshots,30);
    return {...shot,buffer};
  }
  async screenshot(args){return this._run(args,(s,p)=>this._screenshot(s,p,args));}
  _checkReference(ref,p,kind){
    const value=ref?.observation??ref?.shot;
    if(!ref||ref.pageId!==p.id||ref.generation!==p.generation||value.url!==p.page.url()||Date.now()-value.capturedAt>120000||JSON.stringify(value.viewport)!==JSON.stringify(p.page.viewportSize()))throw new Error(`Stale ${kind}; observe or capture this page again before acting`);
    return value;
  }
  async act(args){
    return this._run(args,async(s,p)=>{
      const started=performance.now(),viewport=p.page.viewportSize();
      let point;
      if(args.controlId){
        const obs=this._checkReference(s.observations.get(args.observationId),p,'observation');
        const control=obs.controls.find(c=>c.id===args.controlId);
        if(!control)throw new Error('controlId is not present in observation');
        if(control.actionable===false)throw new Error('This observation is not an actionable control; inspect its screenshot');
        if(control.source!=='manual'){
          const result=await validateControl(p.page,control,{tolerancePx:3});
          if(result===false||result?.valid===false)throw new Error('Stale control: it moved, changed or is no longer visible; observe again');
        }
        point=control.center;
      } else if(args.x!==undefined||args.y!==undefined){
        const input={x:args.x,y:args.y};
        if(args.coordinateSpace==='image')point=imageToViewport(input,this._checkReference(s.screenshots.get(args.screenshotId),p,'screenshot').transform);
        else if(args.coordinateSpace==='normalized')point=normalizedToViewport(input,viewport);
        else point=input;
      }
      if(args.observationId&&!args.controlId)this._checkReference(s.observations.get(args.observationId),p,'observation');
      const pointerKinds=['click','doubleClick','hover','drag'];
      if(pointerKinds.includes(args.kind)){if(!point)throw new Error('This action requires a controlId or coordinates');viewportPoint(point,viewport);}
      const mark=await s.network.mark(args.label??args.kind);
      // Invalidate before an input: an uncertain click must never be silently repeated with an old reference.
      p.generation++;
      switch(args.kind){
        case 'click':await p.page.mouse.click(point.x,point.y,{button:args.button??'left'});break;
        case 'doubleClick':await p.page.mouse.dblclick(point.x,point.y,{button:args.button??'left'});break;
        case 'hover':await p.page.mouse.move(point.x,point.y);break;
        case 'drag':{
          let dest={x:args.toX,y:args.toY};
          if(args.coordinateSpace==='normalized')dest=normalizedToViewport(dest,viewport);
          if(args.coordinateSpace==='image')dest=imageToViewport(dest,s.screenshots.get(args.screenshotId).shot.transform);
          viewportPoint(dest,viewport);await p.page.mouse.move(point.x,point.y);await p.page.mouse.down();
          try{await p.page.mouse.move(dest.x,dest.y,{steps:args.steps??10});}finally{await p.page.mouse.up();}break;
        }
        case 'scroll':if(point)await p.page.mouse.move(...Object.values(viewportPoint(point,viewport)));await p.page.mouse.wheel(args.deltaX??0,args.deltaY??0);break;
        case 'press':if(!args.key||args.key.length>100)throw new Error('key is required');await p.page.keyboard.press(args.key);break;
        case 'type':if(typeof args.text!=='string'||args.text.length>10000)throw new Error('text must contain at most 10000 characters');await p.page.keyboard.insertText(args.text);break;
        case 'wait':await p.page.waitForTimeout(Math.min(Math.max(args.waitMs??1000,0),10000));break;
        default:throw new Error('Unknown action kind');
      }
      if(args.kind!=='wait')await p.page.waitForTimeout(args.settleMs??250);
      return {sessionId:s.id,pageId:p.id,kind:args.kind,point:point??null,url:p.page.url(),mark,durationMs:Math.round(performance.now()-started),needsObservation:true};
    });
  }
  async markControls(args){
    return this._run(args,async(s,p)=>{
      const viewport=p.page.viewportSize();
      if(args.clear)p.manual=[];
      for(const item of args.controls??[]){
        if(p.manual.length>=100)throw new Error('Maximum 100 manual controls per page');
        viewportPoint({x:item.x,y:item.y},viewport);
        if(!Number.isFinite(item.width)||!Number.isFinite(item.height)||item.width<=0||item.height<=0||item.x+item.width>viewport.width||item.y+item.height>viewport.height)throw new Error('Manual control outside viewport');
        p.manual.push({...item,id:id('manual'),label:String(item.label).slice(0,150),url:p.page.url(),viewport});
      }
      p.generation++;
      return {sessionId:s.id,pageId:p.id,controls:this._manual(p,viewport),note:'Manual regions are caller assertions, not detected buttons; cleared on frame navigation and retained only for this URL/viewport.'};
    });
  }
  async network(args){
    return this._run(args,async(s)=>{
      await s.network.flush();
      switch(args.operation??'query'){
        case 'query':return s.network.query(args);
        case 'detail':return s.network.detail(args.requestId,args);
        case 'endpoints':return s.network.endpoints(args);
        case 'stats':case 'flush':return s.network.stats();
        case 'mark':return s.network.mark(args.label??'manual');
        default:throw new Error('Unknown network operation');
      }
    });
  }
  async exportHar(args){
    return this._run(args,async(s)=>{
      await s.network.flush();const har=await s.network.exportHar(args);
      const artifact=await this._artifact(Buffer.from(JSON.stringify(har)),{format:'har',mimeType:'application/json',prefix:'network'});
      return {...artifact,summary:summarizeHar(har),filters:{preset:args.preset??'full',includeBodies:args.includeBodies??true,redact:args.redact??true},capture:s.network.stats()};
    });
  }
  async filterHarFile(args){
    const input=resolve(args.inputPath);
    if(!input.toLowerCase().endsWith('.har'))throw new Error('inputPath must refer to a .har file');
    const info=await stat(input);
    if(!info.isFile()||info.size>512*1024*1024)throw new Error('HAR must be a regular file of at most 512 MiB');
    const har=JSON.parse(await readFile(input,'utf8'));
    if(!Array.isArray(har.log?.entries))throw new Error('Invalid HAR: log.entries missing');
    const filtered=filterHar(har,args);
    const artifact=await this._artifact(Buffer.from(JSON.stringify(filtered)),{format:'har',mimeType:'application/json',prefix:'filtered'});
    return {...artifact,source:basename(input),summary:summarizeHar(filtered)};
  }
  async artifact({artifactId,offset=0,limit=49152}){
    const artifact=this._artifacts.get(artifactId);if(!artifact)throw new Error('Unknown artifactId in this server process');
    if(!Number.isInteger(offset)||offset<0||!Number.isInteger(limit)||limit<1||limit>1048576)throw new Error('Invalid artifact range');
    const {open}=await import('node:fs/promises');const file=await open(artifact.path,'r');
    try{const buffer=Buffer.alloc(Math.min(limit,Math.max(0,artifact.bytes-offset)));const {bytesRead}=await file.read(buffer,0,buffer.length,offset);return {...artifact,offset,bytesRead,encoding:'base64',data:buffer.subarray(0,bytesRead).toString('base64'),nextOffset:offset+bytesRead<artifact.bytes?offset+bytesRead:null};}finally{await file.close();}
  }
  listArtifacts(){return [...this._artifacts.values()];}
  async close({sessionId}){
    const s=this._session(sessionId);
    const task=s.queue.then(async()=>{s.closing=true;await s.network.flush();const stats=s.network.stats();await s.context.close();await s.network.dispose();this._sessions.delete(sessionId);return {sessionId,closed:true,network:stats};});
    s.queue=task.catch(()=>{});
    const result=await task;
    if(!this._sessions.size&&!this._opening&&this._browser){await this._browser.close();this._browser=null;}
    return result;
  }
  async shutdown(){
    await Promise.allSettled([...this._sessions.keys()].map(sessionId=>this.close({sessionId})));
    if(this._browser)await this._browser.close().catch(()=>{});
    this._browser=null;
  }
}
