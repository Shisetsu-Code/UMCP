/** Read-only, bounded UI observations. All returned coordinates are main viewport CSS pixels. */
const STATE = '__umcpUIObservationV1';

// Runs in each document before site scripts. Wrappers always call the original with
// its original receiver/arguments; callbacks are never replaced or invoked by us.
function instrumentDocument() {
  if (Object.prototype.hasOwnProperty.call(globalThis, '__umcpUIObservationV1')) return;
  const state = {
    documentId: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    ids: new WeakMap(), nextId: 1, listeners: new WeakMap(), text: new WeakMap(), installedAt: Date.now(),
  };
  Object.defineProperty(globalThis, '__umcpUIObservationV1', { value: state, configurable: true });
  const events = new Set(['click','dblclick','pointerdown','pointerup','mousedown','mouseup','touchstart','touchend']);
  const capture = options => {
    if (typeof options === 'boolean') return options;
    if (!options) return false;
    // Do not execute an options getter a second time after native add/remove.
    const d = Object.getOwnPropertyDescriptor(options, 'capture');
    return d && !('value' in d) ? null : Boolean(d?.value);
  };
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function(type, callback, options) {
    const result = Reflect.apply(add, this, arguments);
    try { if (events.has(type) && callback) {
      let entries = state.listeners.get(this);
      if (!entries) state.listeners.set(this, entries = []);
      const c = capture(options);
      if (!entries.some(e => e.type===type && e.callback===callback && e.capture===c)) {
        const once = typeof options === 'object' && options && Object.getOwnPropertyDescriptor(options, 'once');
        const signal = typeof options === 'object' && options && Object.getOwnPropertyDescriptor(options, 'signal');
        // Once listeners cannot be tracked without wrapping their callback, which
        // would alter identity. Exclude them rather than claim expired handlers.
        if (!once || ('value' in once && !once.value)) entries.push({type, callback, capture:c, signal:signal && 'value' in signal ? signal.value : null});
      }
    } } catch { /* instrumentation metadata must not alter native success */ }
    return result;
  };
  EventTarget.prototype.removeEventListener = function(type, callback, options) {
    const result = Reflect.apply(remove, this, arguments);
    try { const entries = state.listeners.get(this);
    if (entries) { const c=capture(options); state.listeners.set(this, entries.filter(e => !(e.type===type && e.callback===callback && (c===null || e.capture===null || e.capture===c)))); } } catch { state.listeners.delete(this); }
    return result;
  };
  const proto = globalThis.CanvasRenderingContext2D?.prototype;
  if (!proto) return;
  const nativeGetTransform=proto.getTransform,nativeMeasureText=proto.measureText;
  for (const method of ['fillText','strokeText']) {
    const original = proto[method];
    proto[method] = function(text, x, y) {
      const result = Reflect.apply(original, this, arguments);
      // Avoid coercing user objects again: only primitive strings are recorded.
      if (typeof text === 'string' && text.trim() && Number.isFinite(x) && Number.isFinite(y)) {
        try {
          const matrix=Reflect.apply(nativeGetTransform,this,[]); const metrics=Reflect.apply(nativeMeasureText,this,[text]);
          const points=[{x:x-(metrics.actualBoundingBoxLeft||0),y:y-(metrics.actualBoundingBoxAscent||10)},{x:x+(metrics.actualBoundingBoxRight||metrics.width),y:y+(metrics.actualBoundingBoxDescent||2)}].map(p=>({x:matrix.a*p.x+matrix.c*p.y+matrix.e,y:matrix.b*p.x+matrix.d*p.y+matrix.f}));
          let list=state.text.get(this.canvas); if(!list)state.text.set(this.canvas,list=[]);
          list.push({label:text.slice(0,300),x:Math.min(...points.map(p=>p.x)),y:Math.min(...points.map(p=>p.y)),width:Math.abs(points[1].x-points[0].x),height:Math.abs(points[1].y-points[0].y),observedAt:Date.now()});
          if(list.length>200)list.splice(0,list.length-200);
        } catch { /* text instrumentation must not change drawing success */ }
      }
      return result;
    };
  }
  const clear=proto.clearRect;
  proto.clearRect=function(x,y,w,h){const result=Reflect.apply(clear,this,arguments);if([x,y,w,h].every(v=>typeof v==='number')&&x<=0&&y<=0&&w>=this.canvas.width&&h>=this.canvas.height)state.text.delete(this.canvas);return result;};
}

export async function installInstrumentation(context) {
  await context.addInitScript(instrumentDocument);
}

function inspectDocument({ limit, textLimit=1000 }) {
  const state=globalThis.__umcpUIObservationV1;
  const warnings=[];const controls=[];const canvases=[];const engines=[];
  let visibleText='',visibleTextTruncated=false;
  try {
    // innerText is the browser's rendered text, never input.value, source,
    // textContent or page HTML. Hidden bodies otherwise fall back to textContent.
    const body=document.body,html=document.documentElement;
    const rendered=body&&[body,html].every(el=>{const style=getComputedStyle(el);return style.display!=='none'&&style.visibility!=='hidden'&&style.visibility!=='collapse'&&Number(style.opacity)>0;});
    if(rendered){const text=body.innerText.trim();visibleTextTruncated=text.length>textLimit;visibleText=text.slice(0,textLimit);}
  }catch(error){warnings.push(`Visible text unavailable: ${error.message}`);}
  let visited=0; const MAX_NODES=12000; const MAX_SCENE=2500;
  const id=(object,prefix='dom')=>{let value=state.ids.get(object);if(!value){value=`${state.documentId}:${prefix}:${state.nextId++}`;state.ids.set(object,value);}return value;};
  const data=(obj,key)=>{
    if(!obj || (typeof obj!=='object' && typeof obj!=='function'))return undefined;
    try { let p=obj; for(let i=0;p&&i<5;i++,p=Object.getPrototypeOf(p)){const d=Object.getOwnPropertyDescriptor(p,key);if(d)return 'value' in d?d.value:undefined;} }catch{}
    return undefined;
  };
  const clean=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,300):'';
  const label=el=>clean(el.getAttribute('aria-label') || el.getAttribute('title') || (el.labels && [...el.labels].map(l=>l.textContent).join(' ')) || el.innerText || el.getAttribute('alt') || el.getAttribute('name') || (el.type!=='password' && el.value) || el.id || el.tagName.toLowerCase());
  const clip=r=>{
    const left=Math.max(0,r.x),top=Math.max(0,r.y),right=Math.min(innerWidth,r.x+r.width),bottom=Math.min(innerHeight,r.y+r.height);
    return right>left&&bottom>top?{x:left,y:top,width:right-left,height:bottom-top}:null;
  };
  function hitAt(x,y) {
    let hit=document.elementFromPoint(x,y);
    for(let i=0;hit?.shadowRoot&&i<15;i++){const inner=hit.shadowRoot.elementFromPoint(x,y);if(!inner||inner===hit)break;hit=inner;}
    return hit;
  }
  function visible(el,rect) {
    if(!rect || !el.isConnected || el.closest('[inert]'))return false;
    let ancestor=el;
    for(let n=0;ancestor&&n<80;n++){
      const s=getComputedStyle(ancestor);
      if(s.display==='none'||s.visibility==='hidden'||s.visibility==='collapse'||Number(s.opacity)<=0)return false;
      ancestor=ancestor.parentElement || ancestor.getRootNode()?.host;
    }
    const hit=hitAt(rect.x+rect.width/2,rect.y+rect.height/2);
    if(el===hit||el.contains(hit))return true;
    let p=hit;for(let i=0;p&&i<20;i++,p=p.parentElement||p.getRootNode()?.host)if(p===el)return true;
    return false;
  }
  let declarativeInteractionsLimited=false;
  const declarativePointer=el=>{
    const raw=el.getAttribute('data-interactions');
    if(!raw)return false;
    if(raw.length>8192){declarativeInteractionsLimited=true;return false;}
    try{
      const interactions=JSON.parse(raw);
      if(!Array.isArray(interactions))return false;
      if(interactions.length>32)declarativeInteractionsLimited=true;
      return interactions.slice(0,32).some(entry=>entry&&typeof entry==='object'&&['click','pointerdown','pointerup'].includes(entry.trigger));
    }catch{return false;}
  };
  const selector=el=>el.id?`[id=${JSON.stringify(el.id)}]`:undefined;
  const push=(object,source,kind,name,rect,confidence,extra={})=>{
    if(controls.length>=limit)return;
    const r=clip(rect);if(r)controls.push({id:id(object,source),source,kind,label:name,...r,confidence,...extra});
  };
  const queue=[document.documentElement];
  for(let q=0;q<queue.length&&visited<MAX_NODES;q++){
    const el=queue[q];if(!el)continue;visited++;
    for(const child of el.children){if(queue.length>=MAX_NODES)break;queue.push(child);}
    if(el.shadowRoot)for(const child of el.shadowRoot.children){if(queue.length>=MAX_NODES)break;queue.push(child);}
    const rect=clip(el.getBoundingClientRect());
    if(el.tagName==='CANVAS'){
      if(!visible(el,rect))continue;
      const box=el.getBoundingClientRect();
      const texts=(state.text.get(el)||[]).slice(-100).map(t=>({...t,x:box.x+t.x*(box.width/el.width),y:box.y+t.y*(box.height/el.height),width:t.width*(box.width/el.width),height:t.height*(box.height/el.height),source:'canvas-text',actionable:false,confidence:0.4}));
      canvases.push({id:id(el,'canvas'),...rect,widthPixels:el.width,heightPixels:el.height,text:texts,semantics:'opaque-or-partial',needsVision:true});
      continue;
    }
    if(!rect || el.disabled || el.getAttribute('aria-disabled')==='true')continue;
    const tag=el.tagName;const role=el.getAttribute('role');
    const native=['BUTTON','SELECT','TEXTAREA','SUMMARY'].includes(tag)||(tag==='INPUT'&&el.type!=='hidden')||(tag==='A'&&el.hasAttribute('href'));
    const semantic=['button','link','checkbox','radio','switch','menuitem','tab','slider','spinbutton','textbox','combobox','option'].includes(role)||el.isContentEditable;
    const listener=(state.listeners.get(el)||[]).some(e=>!e.signal?.aborted)||['onclick','onpointerdown','onmousedown','ontouchstart'].some(k=>typeof el[k]==='function');
    const declared=declarativePointer(el)&&!el.hasAttribute('disabled');
    if(!(native||semantic||listener||declared)||!visible(el,rect))continue;
    push(el,'dom',role||tag.toLowerCase(),label(el),rect,native||semantic?0.98:listener?0.8:0.65,{selector:selector(el)});
  }
  if(declarativeInteractionsLimited)warnings.push('Declarative interaction inspection limited to 8192 characters and 32 entries per element');
  if(visited>=MAX_NODES)warnings.push(`DOM traversal limited to ${MAX_NODES} nodes`);
  if(controls.length>=limit)warnings.push(`Control output limited to ${limit}`);

  // Discover only documented/common root slots and bounded direct data properties.
  // No global enumeration, general object recursion or accessor getter execution.
  const globals=['app','game','stage','pixiApp','phaserGame','__PIXI_APP__','__PHASER_GAME__','__UMCP_SCENE_ROOTS__'];
  const candidates=[];for(const key of globals){const value=data(globalThis,key);if(value)candidates.push(value);}
  const custom=data(globalThis,'__UMCP_SCENE_ROOTS__');if(Array.isArray(custom))for(const entry of custom.slice(0,20))candidates.push(entry);
  const scenes=[];const seenRoots=new Set();
  const addScene=(name,root,canvas,width,height,camera)=>{if(!root||seenRoots.has(root)||!(canvas instanceof HTMLCanvasElement))return;seenRoots.add(root);scenes.push({name,root,canvas,width:width||canvas.width,height:height||canvas.height,camera});};
  for(const candidate of candidates.slice(0,40)){
    const renderer=data(candidate,'renderer'); const stage=data(candidate,'stage');
    const canvas=data(renderer,'canvas')||data(renderer,'view')||data(candidate,'canvas')||data(candidate,'view');
    const screen=data(renderer,'screen');
    if(stage&&renderer)addScene('PixiJS',stage,canvas,data(screen,'width'),data(screen,'height'));
    const manager=data(candidate,'scene');const phaserScenes=data(manager,'scenes');
    if(Array.isArray(phaserScenes))for(const scene of phaserScenes.slice(0,20)){
      const sys=data(scene,'sys');const settings=data(sys,'settings');if(data(settings,'active')===false||data(settings,'visible')===false)continue;
      const root=data(scene,'children');const camera=data(data(scene,'cameras'),'main');
      const size=data(data(candidate,'scale'),'gameSize');
      addScene('Phaser',root,canvas,data(size,'width'),data(size,'height'),camera);
    }
    if(data(candidate,'canvas')&&Array.isArray(data(candidate,'children')))addScene('CreateJS',candidate,data(candidate,'canvas'));
  }
  const laya=data(globalThis,'Laya');const layaStage=data(laya,'stage');
  if(layaStage){const canvas=data(laya,'canvas')||document.querySelector('canvas');addScene('Laya',layaStage,canvas,data(layaStage,'width'),data(layaStage,'height'));}
  for(const name of ['PIXI','Phaser','Laya','createjs'])if(data(globalThis,name))engines.push({name:({PIXI:'PixiJS',createjs:'CreateJS'})[name]||name,detectedBy:'global-signature',sceneAccessible:false});
  let sceneVisits=0;
  for(const scene of scenes){
    let engine=engines.find(e=>e.name===scene.name);if(!engine)engines.push(engine={name:scene.name,detectedBy:'scene-root',sceneAccessible:true});engine.sceneAccessible=true;
    const canvasRect=clip(scene.canvas.getBoundingClientRect());if(!visible(scene.canvas,canvasRect))continue;
    const box=scene.canvas.getBoundingClientRect();const sx=box.width/scene.width,sy=box.height/scene.height;
    if(!Number.isFinite(sx)||!Number.isFinite(sy))continue;
    const items=[{node:scene.root,visible:true}];const seen=new Set();
    for(let n=0;n<items.length&&sceneVisits<MAX_SCENE;n++){
      const {node,visible:parentVisible}=items[n];if(!node||seen.has(node))continue;seen.add(node);sceneVisits++;
      const visibleNode=parentVisible&&data(node,'visible')!==false&&data(node,'renderable')!==false&&data(node,'worldVisible')!==false&&data(node,'alpha')!==0&&data(node,'worldAlpha')!==0;
      if(!visibleNode)continue;
      const children=data(node,'children')||data(node,'list')||data(node,'_children');
      if(Array.isArray(children))for(const child of children.slice(0,MAX_SCENE-items.length))items.push({node:child,visible:visibleNode});
      const input=data(node,'input');const listeners=data(node,'_listeners')||data(node,'_events');
      const events=['click','mousedown','pressup','pointerdown','pointerup'];
      const isInteractive=data(node,'interactive')===true||['static','dynamic'].includes(data(node,'eventMode')||data(node,'_eventMode'))||data(input,'enabled')===true||(data(node,'mouseEnabled')===true&&events.some(key=>data(listeners,key)));
      if(!isInteractive)continue;
      const getBounds=data(node,'getBounds');if(typeof getBounds!=='function')continue;
      let bounds;try{bounds=Reflect.apply(getBounds,node,[]);}catch{continue;}
      if(!bounds)continue;
      let x=data(bounds,'x')??data(bounds,'minX'),y=data(bounds,'y')??data(bounds,'minY');
      let width=data(bounds,'width')??(data(bounds,'maxX')-x),height=data(bounds,'height')??(data(bounds,'maxY')-y);
      if(scene.name==='CreateJS'){
        const toGlobal=data(node,'localToGlobal');if(typeof toGlobal!=='function')continue;
        try{const a=Reflect.apply(toGlobal,node,[x,y]);const b=Reflect.apply(toGlobal,node,[x+width,y+height]);x=data(a,'x');y=data(a,'y');width=data(b,'x')-x;height=data(b,'y')-y;}catch{continue;}
      }
      if(scene.name==='Phaser'&&scene.camera){
        if(data(scene.camera,'rotation')){warnings.push('Rotated Phaser camera requires vision');continue;}
        const zoom=data(scene.camera,'zoom')||1;
        x=(x-(data(scene.camera,'scrollX')||0))*zoom+(data(scene.camera,'x')||0);y=(y-(data(scene.camera,'scrollY')||0))*zoom+(data(scene.camera,'y')||0);width*=zoom;height*=zoom;
      }
      if(![x,y,width,height].every(Number.isFinite)||width<=0||height<=0)continue;
      const rect=clip({x:box.x+x*sx,y:box.y+y*sy,width:width*sx,height:height*sy});
      if(!rect||rect.x<box.x||rect.y<box.y||rect.x+rect.width>box.right||rect.y+rect.height>box.bottom)continue;
      if(!visible(scene.canvas,rect))continue;
      const name=clean(data(node,'accessibilityTitle')||data(node,'name')||data(node,'label')||data(node,'text'))||`${scene.name} interactive object`;
      push(node,'engine','scene-object',name,rect,0.7,{engine:scene.name});
    }
  }
  if(sceneVisits>=MAX_SCENE)warnings.push(`Scene traversal limited to ${MAX_SCENE} nodes`);
  if(canvases.length)warnings.push('Canvas coverage is partial: text draws are historical observations; opaque, WebGL, masked and inaccessible scene semantics require vision.');
  return {controls,canvases,engines,warnings,visibleText,visibleTextTruncated,viewport:{width:innerWidth,height:innerHeight},documentId:state.documentId};
}

function optionsNumber(value,name,{min=0,max=100000,integer=false}={}) {
  if(!Number.isFinite(value)||value<min||value>max||(integer&&!Number.isInteger(value)))throw new RangeError(`${name} must be ${integer?'an integer':'a number'} between ${min} and ${max}`);
  return value;
}

async function frameGeometry(frame, page, cache) {
  if(cache.has(frame))return cache.get(frame);
  const parent=frame.parentFrame();
  let geometry;
  if(!parent){const size=await frame.evaluate(()=>({width:innerWidth,height:innerHeight}));geometry={x:0,y:0,sx:1,sy:1,clip:{x:0,y:0,...size}};}
  else {
    const pg=await frameGeometry(parent,page,cache);const handle=await frame.frameElement();
    try {
      const box=await handle.boundingBox();
      const dimensions=await handle.evaluate(el=>{
        const iframeVisibility=getComputedStyle(el).visibility;
        let hidden=iframeVisibility==='hidden'||iframeVisibility==='collapse';
        let unsupportedTransform=false;
        for(let ancestor=el;ancestor;ancestor=ancestor.parentElement||ancestor.getRootNode()?.host){
          const style=getComputedStyle(ancestor);
          // visibility is inherited but descendants may override it. Only the
          // iframe's computed visibility decides that property; display/opacity
          // on any ancestor hide the whole embedded surface.
          if(style.display==='none'||Number(style.opacity)<=0)hidden=true;
          if(style.transform!=='none'){
            const match=style.transform.match(/^matrix\(([^)]+)\)$/);
            const m=match?.[1].split(',').map(Number);
            if(!m||m.length!==6||!m.every(Number.isFinite)||m[0]<=0||m[3]<=0||Math.abs(m[1])>0.00001||Math.abs(m[2])>0.00001)unsupportedTransform=true;
          }
          // Independent CSS transform properties do not appear in .transform.
          if(style.rotate&&style.rotate!=='none'&&style.rotate!=='0deg')unsupportedTransform=true;
          if(style.scale&&style.scale!=='none'&&style.scale.split(/\s+/).some(v=>!Number.isFinite(Number(v))||Number(v)<=0))unsupportedTransform=true;
          if(style.perspective&&style.perspective!=='none')unsupportedTransform=true;
        }
        return {width:el.offsetWidth,height:el.offsetHeight,borderX:el.clientLeft,borderY:el.clientTop,clientWidth:el.clientWidth,clientHeight:el.clientHeight,unsupportedTransform,hidden};
      });
      if(dimensions.hidden){
        geometry={x:0,y:0,sx:1,sy:1,clip:null,handle,parent};
        cache.set(frame,geometry);
        return geometry;
      }
      if(!box||!dimensions.width||!dimensions.height)throw new Error('Frame has no visible bounds');
      // Axis aligned CSS scaling is supported. Rotation/skew cannot be represented
      // by one CSS bounding rectangle, so do not publish unsafe click coordinates.
      if(dimensions.unsupportedTransform)throw new Error('Rotated, reflected, skewed or perspective iframe/ancestor requires vision');
      const sx=box.width/dimensions.width,sy=box.height/dimensions.height;
      const x=box.x+dimensions.borderX*sx,y=box.y+dimensions.borderY*sy;
      geometry={x,y,sx,sy,clip:intersection(pg.clip,{x,y,width:dimensions.clientWidth*sx,height:dimensions.clientHeight*sy}),handle,parent};
    }catch(error){await handle.dispose();throw error;}
  }
  cache.set(frame,geometry);return geometry;
}
function intersection(a,b){if(!a||!b)return null;const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),right=Math.min(a.x+a.width,b.x+b.width),bottom=Math.min(a.y+a.height,b.y+b.height);return right>x&&bottom>y?{x,y,width:right-x,height:bottom-y}:null;}
function transformRect(rect,g){return intersection(g.clip,{x:g.x+rect.x*g.sx,y:g.y+rect.y*g.sy,width:rect.width*g.sx,height:rect.height*g.sy});}
async function ancestorsUncovered(frame,point,cache){
  for(let f=frame;f.parentFrame();f=f.parentFrame()){
    const g=cache.get(f),pg=cache.get(f.parentFrame());
    const visible=await g.handle.evaluate((el,{x,y})=>{let hit=el.ownerDocument.elementFromPoint(x,y);for(let i=0;hit?.shadowRoot&&i<15;i++){const next=hit.shadowRoot.elementFromPoint(x,y);if(!next||next===hit)break;hit=next;}return hit===el;},{x:(point.x-pg.x)/pg.sx,y:(point.y-pg.y)/pg.sy});
    if(!visible)return false;
  }
  return true;
}

export async function detectUI(page,{maxControls=200}={}) {
  optionsNumber(maxControls,'maxControls',{max:2000,integer:true});
  const controls=[],canvases=[],engines=[],frames=[],warnings=[],visibleText=[];const cache=new Map();
  let textChars=0,textTotalTruncated=false;
  const allFrames=page.frames().slice(0,100);if(page.frames().length>100)warnings.push('Frame traversal limited to 100 frames');
  let viewport;
  try {viewport=await page.mainFrame().evaluate(()=>({width:innerWidth,height:innerHeight}));}catch(error){throw new Error(`Cannot observe page: ${error.message}`);}
  try {
    for(let index=0;index<allFrames.length;index++){
      const frame=allFrames[index];const frameUrl=frame.url();
      try {
        const g=await frameGeometry(frame,page,cache);if(!g.clip)continue;
        const installed=await frame.evaluate(()=>Boolean(globalThis.__umcpUIObservationV1));
        if(!installed){await frame.evaluate(instrumentDocument);warnings.push(`Frame ${index}: late instrumentation cannot recover earlier listeners/text draws`);}
        const textLimit=Math.min(1000,8000-textChars);
        const result=await frame.evaluate(inspectDocument,{limit:maxControls,textLimit});
        if(result.visibleText)visibleText.push({frameIndex:index,frameUrl,text:result.visibleText,truncated:result.visibleTextTruncated});
        textChars+=result.visibleText.length;
        if(result.visibleTextTruncated){
          if(textLimit<1000)textTotalTruncated=true;
          else warnings.push(`Frame ${index}: Visible text output limited to 1000 characters`);
        }
        frames.push({index,url:frameUrl,documentId:result.documentId,viewport:result.viewport,offset:{x:g.x,y:g.y},scale:{x:g.sx,y:g.sy}});
        for(const control of result.controls){
          if(controls.length>=maxControls)break;
          const rect=transformRect(control,g);if(!rect)continue;
          const center={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
          if(!await ancestorsUncovered(frame,center,cache))continue;
          controls.push({...control,...rect,center,normalized:{x:center.x/viewport.width,y:center.y/viewport.height},frameUrl,frameIndex:index});
        }
        for(const canvas of result.canvases){const rect=transformRect(canvas,g);if(!rect)continue;const center={x:rect.x+rect.width/2,y:rect.y+rect.height/2};if(!await ancestorsUncovered(frame,center,cache))continue;canvases.push({...canvas,...rect,frameUrl,frameIndex:index,text:canvas.text.map(t=>{const tr=transformRect(t,g);return tr?{...t,...tr}:null}).filter(Boolean)});}
        engines.push(...result.engines.map(e=>({...e,frameUrl,frameIndex:index})));
        warnings.push(...result.warnings.map(w=>`Frame ${index}: ${w}`));
      }catch(error){warnings.push(`Frame ${index} unavailable: ${error.message}`);}
    }
  }finally{for(const g of cache.values())if(g.handle)await g.handle.dispose().catch(()=>{});}
  if(textTotalTruncated)warnings.push('Visible text output limited to 8000 characters across all frames');
  return {controls,canvases,engines,frames,visibleText,needsVision:canvases.length>0||warnings.some(w=>w.includes('unavailable')||w.includes('limited')),warnings:[...new Set(warnings)],viewport};
}

function matches(a,b,tolerance){return Boolean(a&&b&&a.id===b.id&&a.label===b.label&&a.source===b.source&&['x','y','width','height'].every(k=>Number.isFinite(a[k])&&Number.isFinite(b[k])&&Math.abs(a[k]-b[k])<=tolerance));}
export async function validateControl(page,control,{tolerancePx=3}={}) {
  optionsNumber(tolerancePx,'tolerancePx',{max:1000});
  if(!control||typeof control.id!=='string')return false;
  const current=await detectUI(page,{maxControls:2000});
  return matches(control,current.controls.find(c=>c.id===control.id),tolerancePx);
}
export async function observeStable(page,{samples=3,intervalMs=2000,tolerancePx=3,maxControls=200}={}) {
  optionsNumber(samples,'samples',{min:2,max:20,integer:true});optionsNumber(intervalMs,'intervalMs',{max:60000});optionsNumber(tolerancePx,'tolerancePx',{max:1000});
  const startedAt=Date.now(), observations=[];
  for(let i=0;i<samples;i++){if(i)await new Promise(resolve=>setTimeout(resolve,intervalMs));observations.push(await detectUI(page,{maxControls}));}
  const last=observations.at(-1);const ids=new Set(observations.flatMap(o=>o.controls.map(c=>c.id)));
  const stableControls=last.controls.filter(control=>{
    const targets=observations.map(o=>o.controls.find(c=>c.id===control.id));
    return targets.every(c=>matches(control,c,tolerancePx))&&['x','y','width','height'].every(key=>Math.max(...targets.map(c=>c[key]))-Math.min(...targets.map(c=>c[key]))<=tolerancePx);
  });
  const stableIds=new Set(stableControls.map(c=>c.id));const unstableControls=[...ids].filter(id=>!stableIds.has(id));
  const documentsMatch=observations.every(o=>JSON.stringify(o.frames.map(f=>f.documentId))===JSON.stringify(last.frames.map(f=>f.documentId)));
  // Stability describes actionable controls. Truncated/unavailable prose retains
  // its warning and needsVision signal but does not make control coverage partial.
  // Only frame inspection failures or actual traversal/control limits do that.
  const affectsControlIntegrity=warning=>/^(?:Frame traversal limited|Frame \d+ unavailable:)|(?:^|: )(?:DOM traversal limited|Scene traversal limited|Control output limited|Declarative interaction inspection limited)/.test(warning);
  const complete=observations.every(o=>!o.warnings.some(affectsControlIntegrity));
  const finishedAt=Date.now();
  return {...last,controls:stableControls,stable:unstableControls.length===0&&documentsMatch&&complete,unstableControls,samples,timing:{startedAt,finishedAt,elapsedMs:finishedAt-startedAt,intervalMs},warnings:[...new Set(observations.flatMap(o=>o.warnings))]};
}
