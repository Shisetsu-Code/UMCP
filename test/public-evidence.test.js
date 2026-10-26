import test from 'node:test';
import assert from 'node:assert/strict';
import { publicHar } from '../scripts/public-evidence.js';

test('public CI HAR evidence excludes opaque bodies, all headers, query values and socket IDs',()=>{
  const result=publicHar({log:{entries:[{
    _id:'net-1',startedDateTime:'2026-01-01T00:00:00Z',time:5,_resourceType:'websocket',_state:'closed',
    request:{method:'GET',url:'wss://example.com/socket.io/1/websocket/fixture-secret?unknown=fixture-secret',httpVersion:'unknown',headers:[{name:'unusual-auth',value:'fixture-secret'}],postData:{text:'fixture-secret'},bodySize:10},
    response:{status:0,statusText:'fixture-secret',headers:[{name:'misc',value:'fixture-secret'}],content:{text:'fixture-secret',size:10},bodySize:10},
    _webSocketMessages:[{type:'send',time:1,opcode:2,data:Buffer.from('\0token=fixture-secret').toString('base64'),size:20}],
    _error:'fixture-secret',_custom:'fixture-secret'
  }]}});
  const encoded=JSON.stringify(result);
  assert.ok(!encoded.includes('fixture-secret'));assert.ok(!encoded.includes(Buffer.from('\0token=fixture-secret').toString('base64')));
  assert.equal(result.log.entries[0]._webSocketMessages[0].opcode,2);
  assert.equal(result.log.entries[0].request.headers.length,0);
});
