// Real public demos, using the same BrowserService called by MCP. No saved session
// tokens, replayed wagers, stealth patches or automated challenge solving.
import { readFile, writeFile, mkdir, appendFile, mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { BrowserService } from '../src/browser.js';
import { publicHar, publicUrl } from './public-evidence.js';

const targets=JSON.parse(await readFile(new URL('../examples/live-targets.json',import.meta.url),'utf8'));
const selected=process.argv[2]??'belatra';
const chosen=selected==='all'?targets:targets.filter(t=>t.id===selected);
if(!chosen.length)throw new Error(`Unknown target: ${selected}`);
const base=resolve(process.env.UMCP_LIVE_ARTIFACTS??'artifacts/live');
await mkdir(base,{recursive:true});
const safeUrl=publicUrl;
const sanitize=value=>{
  if(Array.isArray(value))return value.map(sanitize);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>k!=='buffer').map(([k,v])=>[k,/url|uri/i.test(k)&&typeof v==='string'&&/^https?:/.test(v)?safeUrl(v):sanitize(v)]));
  return value;
};
const results=[];
for(const target of chosen){
  const started=performance.now();const dir=join(base,target.id);await mkdir(dir,{recursive:true});
  // Generic exports remain outside the directory uploaded by Actions, even if
  // a later conversion or browser operation throws.
  const privateDir=await mkdtemp(join(tmpdir(),'umcp-live-private-'));
  const service=new BrowserService({headless:true,artifactDir:privateDir});
  const report={target:target.id,family:target.family,game:target.game,publicLaunchUrl:target.url,startedAt:new Date().toISOString(),status:'error',steps:[],measurements:{},limitations:[]};
  try{
    const opened=await service.open({url:target.url,timeoutMs:45000,captureBodies:'activity',maxEntries:5000});
    const sessionId=opened.sessionId;report.measurements.openMs=Math.round(performance.now()-started);report.navigationError=opened.navigationError;
    const page=service._session(sessionId).pages.get(opened.pageId).page;
    let obs,blocked=false;const clicked=new Set();
    for(let round=0;round<14;round++){
      if(opened.navigationError&&round===0){report.status='navigation-failed';report.limitations.push('Navigation failed; a browser error page is not a loaded game.');break;}
      const text=await page.locator('body').innerText({timeout:3000}).catch(()=> '');
      if(/verify you are human|checking your browser|access denied|site unavailable|cloudflare ray id|enable javascript and cookies to continue|this site is not available in your|not available in your (country|region)/i.test(text)){
        report.status='external-block';report.limitations.push('Public site returned an access/challenge/region block. No challenge bypass attempted.');blocked=true;break;
      }
      // Some public launch APIs return a fresh URL as JSON rather than an HTTP redirect.
      if(round===0&&text.trim().startsWith('{')){
        let body;try{body=JSON.parse(text);}catch{}
        const launch=body?.url??body?.launchUrl??body?.gameUrl??body?.data?.url;
        if(typeof launch==='string'&&/^https:\/\//.test(launch)){await service.navigate({sessionId,url:launch});report.steps.push({kind:'public-launch-response'});continue;}
      }
      const before=performance.now();obs=await service.observe({sessionId,samples:1,maxControls:300});
      report.measurements.observeMs=Math.round(performance.now()-before);
      const stats=await service.network({sessionId,operation:'stats'});
      const endpoint=await service.network({sessionId,operation:'query',urlIncludes:target.expectedEndpoint,limit:5});
      report.expectedEndpointObserved=endpoint.entries.length>0;
      const meaningfulCanvas=obs.canvases.some(c=>c.width>=250&&c.height>=150);
      if(meaningfulCanvas&&round>=3){
        report.status=report.expectedEndpointObserved?'game-observed':'canvas-observed';
        break;
      }
      const safeControl=obs.controls.find(c=>!clicked.has(c.label)&&c.label.length<90&&/^(reject all|reject all cookies|accept all|accept all cookies|aceptar todas|rechazar todas|play demo|demo|try demo|play for fun|try for free|play now|launch game|play game|continue|start|skip intro|i am (over )?18.*)$/i.test(c.label.trim()));
      if(safeControl&&report.steps.length<5){
        await service.act({sessionId,kind:'click',controlId:safeControl.id,observationId:obs.observationId,settleMs:500,label:'smoke-public-launch'});
        clicked.add(safeControl.label);report.steps.push({kind:'control-click',label:safeControl.label,source:safeControl.source});
        const pages=await service.pages({sessionId});if(pages.pages.length>1)await service.pages({sessionId,selectPageId:pages.pages.at(-1).pageId});
      }else await service.act({sessionId,kind:'wait',waitMs:2000});
      if(stats.httpEntries===0&&round>2)break;
    }
    obs=await service.observe({sessionId,samples:3,intervalMs:500,maxControls:300});
    report.observation={controls:obs.controls.length,bySource:Object.fromEntries(['dom','engine','manual'].map(source=>[source,obs.controls.filter(c=>c.source===source).length])),canvases:obs.canvases.length,engines:obs.engines,needsVision:obs.needsVision,stable:obs.stable,frames:obs.frames.length,warnings:obs.warnings};
    if(report.status==='error')report.status=blocked?'external-block':'no-game-surface';
    const lowStart=performance.now();const low=await service.screenshot({sessionId,preset:'low',overlay:true});report.measurements.lowScreenshotMs=Math.round(performance.now()-lowStart);
    const highStart=performance.now();const high=await service.screenshot({sessionId,preset:'high'});report.measurements.highScreenshotMs=Math.round(performance.now()-highStart);
    await copyFile(low.path,join(dir,low.name));await copyFile(high.path,join(dir,high.name));
    report.images={low:{name:low.name,width:low.width,height:low.height,bytes:low.bytes},high:{name:high.name,width:high.width,height:high.height,bytes:high.bytes},byteReductionPercent:Math.round((1-low.bytes/high.bytes)*1000)/10};
    const exportStart=performance.now();const activity=await service.exportHar({sessionId,preset:'activity',redact:true,includeBodies:false});report.measurements.exportMs=Math.round(performance.now()-exportStart);
    const metadata=await service.exportHar({sessionId,preset:'metadata',redact:true});
    for(const artifact of [activity,metadata])await writeFile(join(dir,artifact.name),JSON.stringify(publicHar(JSON.parse(await readFile(artifact.path,'utf8')))));
    report.network={stats:activity.capture,activityEntries:activity.summary.entries,activityHar:activity.name,metadataHar:metadata.name,webSocketFrames:activity.summary.webSocketFrames};
    await writeFile(join(dir,'observation.json'),JSON.stringify(sanitize(obs),null,2));
    report.finalUrl=safeUrl((await service.pages({sessionId})).pages.find(p=>p.active)?.url??'');
    if(obs.needsVision)report.limitations.push('Canvas semantics require model vision where no accessible scene graph exists. This smoke does not validate all game buttons.');
    report.limitations.push('Navigation/observation/network smoke only: no spin, purchase or all-feature coverage claimed.');
  }catch(error){report.error=String(error.message??error);report.status='error';}
  finally{await service.shutdown();await rm(privateDir,{recursive:true,force:true});}
  report.measurements.totalMs=Math.round(performance.now()-started);
  await writeFile(join(dir,'result.json'),JSON.stringify(sanitize(report),null,2));
  console.log(JSON.stringify(sanitize(report),null,2));results.push(report);
  if(process.env.GITHUB_STEP_SUMMARY){
    await appendFile(process.env.GITHUB_STEP_SUMMARY,`\n## ${target.family} — ${target.game}\n\nStatus: **${report.status}**\n\n| Metric | Value |\n|---|---:|\n| Controls | ${report.observation?.controls??0} |\n| Canvas | ${report.observation?.canvases??0} |\n| HTTP | ${report.network?.stats.httpEntries??0} |\n| WS frames | ${report.network?.webSocketFrames??0} |\n| Total ms | ${report.measurements.totalMs} |\n\n${report.limitations.join('\n\n')}\n`);
  }
}
await writeFile(join(base,`results-${selected}.json`),JSON.stringify(sanitize(results),null,2));
// A missing game surface must not become a green "game tested" claim.
if(results.some(r=>!['game-observed','canvas-observed'].includes(r.status)))process.exitCode=1;
