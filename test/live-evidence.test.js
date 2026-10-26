import test from 'node:test';
import assert from 'node:assert/strict';
import { successfulEndpointEntries } from '../scripts/live-evidence.js';

test('live-game evidence rejects failed, pending, static and query-only endpoint matches',()=>{
  const valid={url:'https://demo.example/provider/play/init',transport:'http',resourceType:'xhr',state:'finished',status:200};
  const entries=[
    {...valid,id:'http-ok'},
    {...valid,id:'forbidden',status:403},
    {...valid,id:'pending',state:'pending'},
    {...valid,id:'static',resourceType:'script'},
    {...valid,id:'query',url:'https://demo.example/metrics?target=/play/init'},
    {...valid,id:'prefix',url:'https://demo.example/play/initial-image'},
    {...valid,id:'ws-rejected',transport:'ws',state:'failed',frames:0,error:'403'},
    {...valid,id:'ws-created',transport:'ws',state:'connecting',status:0,frames:0},
    {...valid,id:'ws-ok',transport:'ws',state:'open',status:0,frames:2}
  ];
  assert.deepEqual(successfulEndpointEntries(entries,'/play/init').map(e=>e.id),['http-ok','ws-ok']);
});
