// A request existing in the recorder is not proof of a working game endpoint.
export function successfulEndpointEntries(entries, expectedPath) {
  return entries.filter(entry => {
    let path;try { path=new URL(entry.url).pathname; }catch { return false; }
    const at=path.indexOf(expectedPath);
    if(at<0)return false;
    const suffix=path.slice(at+expectedPath.length);
    if(!expectedPath.endsWith('/')&&suffix&&!suffix.startsWith('/'))return false;
    if(entry.error||entry.state==='failed')return false;
    if(entry.transport==='ws')return entry.frames>0;
    return ['xhr','fetch','eventsource'].includes(entry.resourceType)&&entry.state==='finished'&&entry.status>=200&&entry.status<300;
  });
}
