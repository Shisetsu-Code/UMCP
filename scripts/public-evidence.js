// Public CI output is intentionally metadata-only. This does not change the
// user's local HAR exports, which can retain payloads when requested.
export function publicUrl(value){
  try{
    const u=new URL(value);
    if(!['http:','https:','ws:','wss:'].includes(u.protocol))return u.protocol;
    const path=u.pathname.replace(/(\/socket\.io\/[^/]+\/websocket\/)[^/]+/gi,'$1{connectionId}').split('/').map(p=>p.length>=24||/^[\da-f]{8}-[\da-f-]{27,}$/i.test(p)?'{opaqueId}':p).join('/');
    return u.origin+path;
  }catch{return '(unavailable)';}
}
export function publicHar(har){
  return {log:{version:'1.2',creator:{name:'UMCP public CI evidence',version:'0.1.0'},_publication:{payloads:false,headers:false,queryValues:false,note:'Metadata allowlist; raw local exports are not uploaded by this workflow.'},entries:(har.log?.entries??[]).map(e=>({
    startedDateTime:e.startedDateTime,time:e.time,_id:e._id,_resourceType:e._resourceType,_state:e._state,
    request:{method:e.request?.method,url:publicUrl(e.request?.url),httpVersion:e.request?.httpVersion??'unknown',headers:[],cookies:[],queryString:[],headersSize:e.request?.headersSize??-1,bodySize:e.request?.bodySize??-1},
    response:{status:e.response?.status??0,statusText:'',httpVersion:e.response?.httpVersion??'unknown',headers:[],cookies:[],redirectURL:e.response?.redirectURL?publicUrl(e.response.redirectURL):'',headersSize:e.response?.headersSize??-1,bodySize:e.response?.bodySize??-1,content:{size:e.response?.content?.size??0,mimeType:e.response?.content?.mimeType??'',_bodyState:'excluded-public-evidence'}},
    cache:{},timings:e.timings??{send:0,wait:0,receive:0},
    ...(e._webSocketMessages?{_webSocketMessages:e._webSocketMessages.map(f=>({type:f.type,time:f.time,opcode:f.opcode,size:f.size,_bodyState:'excluded-public-evidence'}))}:{})
  }))}};
}
