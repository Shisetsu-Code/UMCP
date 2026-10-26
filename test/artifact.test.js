import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserService } from '../src/browser.js';

test('artifact quotas reject concurrent overflow without orphaning or evicting evidence',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'umcp-artifacts-'));
  try{
    const service=new BrowserService({artifactDir:dir,maxArtifacts:2,maxArtifactBytes:5});
    const meta={format:'har',mimeType:'application/json'};
    const results=await Promise.allSettled([service._artifact(Buffer.from('abc'),meta),service._artifact(Buffer.from('def'),meta)]);
    assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
    assert.match(results.find(r=>r.status==='rejected').reason.message,/quota/i);
    const first=results.find(r=>r.status==='fulfilled').value;
    assert.equal(Buffer.from((await service.artifact({artifactId:first.artifactId})).data,'base64').toString(),'abc');
    await service._artifact(Buffer.from('de'),meta);
    await assert.rejects(service._artifact(Buffer.alloc(0),meta),/quota/i);
    assert.equal(service.listArtifacts().length,2);
    assert.equal((await readdir(dir)).length,2);
    assert.equal((await service.artifact({artifactId:first.artifactId})).bytesRead,3);
  }finally{await rm(dir,{recursive:true,force:true});}
});
