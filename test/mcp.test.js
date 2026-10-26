import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { startFixture } from './fixture-server.js';

test('actual stdio MCP initialize/list/call/image/resource and input validation', {timeout:60000},async()=>{
  const fixture=await startFixture();const dir=await mkdtemp(join(tmpdir(),'umcp-mcp-'));
  const env=Object.fromEntries(Object.entries(process.env).filter(([,v])=>typeof v==='string'));
  const transport=new StdioClientTransport({command:process.execPath,args:[resolve('src/index.js'),'--headless','--artifacts',dir],env,stderr:'pipe'});
  let stderr='';transport.stderr.on('data',data=>{stderr+=data.toString();});
  const client=new Client({name:'umcp-test-client',version:'1.0.0'});
  try{
    await client.connect(transport);
    const tools=await client.listTools();assert.ok(tools.tools.length>=13);assert.ok(tools.tools.some(t=>t.name==='umcp_network'));
    const opened=await client.callTool({name:'umcp_open',arguments:{url:fixture.url}});assert.ok(!opened.isError,JSON.stringify(opened));
    const sessionId=opened.structuredContent.sessionId;
    const observed=await client.callTool({name:'umcp_observe',arguments:{sessionId,samples:1}});assert.ok(observed.structuredContent.controls.some(c=>c.label==='Test action'));
    const shot=await client.callTool({name:'umcp_screenshot',arguments:{sessionId,maxWidth:640,quality:35}});assert.ok(shot.content.some(c=>c.type==='image'));assert.equal(shot.structuredContent.width,640);
    const exported=await client.callTool({name:'umcp_export_har',arguments:{sessionId,preset:'activity'}});assert.ok(exported.content.some(c=>c.type==='resource_link'));
    const resources=await client.listResources();assert.ok(resources.resources.length>=2);
    const artifact=await client.readResource({uri:exported.structuredContent.uri});assert.ok(artifact.contents.length===1);
    const invalid=await client.callTool({name:'umcp_screenshot',arguments:{sessionId,quality:900}});assert.equal(invalid.isError,true);
    const closed=await client.callTool({name:'umcp_close',arguments:{sessionId}});assert.equal(closed.structuredContent.closed,true);
    assert.ok(!stderr.includes('UnhandledPromiseRejection'),stderr);
  }finally{await client.close();await fixture.close();await rm(dir,{recursive:true,force:true});}
});
