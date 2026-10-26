import http from 'node:http';
import { WebSocketServer } from 'ws';

export async function startFixture(){
  const received=[];
  const server=http.createServer(async(req,res)=>{
    const url=new URL(req.url,'http://fixture.test');
    let body=''; for await(const chunk of req) body+=chunk;
    if(url.pathname==='/api/hold'){received.push({path:url.pathname,method:req.method,body});res.writeHead(200,{'content-type':'text/event-stream'});res.flushHeaders();return;}
    if(url.pathname.startsWith('/api/')){
      received.push({path:url.pathname,method:req.method,body});
      res.setHeader('content-type','application/json');
      res.end(JSON.stringify({ok:true,path:url.pathname,received:body,sessionToken:'fixture-secret',balance:1000})); return;
    }
    if(url.pathname==='/redirect'){res.writeHead(302,{location:'/'});res.end();return;}
    if(url.pathname==='/missing'){res.writeHead(503,{'content-type':'application/json'});res.end('{"error":"fixture"}');return;}
    if(url.pathname==='/asset.svg'){res.setHeader('content-type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="blue"/></svg>');return;}
    if(url.pathname==='/frame'){
      res.setHeader('content-type','text/html');res.end('<style>body{margin:0}button{position:absolute;left:30px;top:20px;width:140px;height:40px}</style><button id="frame-button" onclick="this.textContent=\'Frame clicked\'">Frame control</button>');return;
    }
    if(url.pathname==='/next'){res.setHeader('content-type','text/html');res.end('<button>Next page</button>');return;}
    if(url.pathname==='/popup'){res.setHeader('content-type','text/html');res.end('<button>Popup control</button><script>fetch("/api/popup")</script>');return;}
    res.setHeader('content-type','text/html');res.end(`<!doctype html><html><head><title>UMCP deterministic fixture</title>
      <style>body{margin:0;background:#142331;color:white;font:18px sans-serif}button{cursor:pointer}#spin{position:absolute;left:200px;top:100px;width:180px;height:60px}#popup{position:absolute;left:410px;top:100px;width:180px;height:60px}#status{position:absolute;left:200px;top:170px}iframe{position:absolute;left:100px;top:300px;width:300px;height:100px;border:0}canvas{position:absolute;left:600px;top:300px;width:400px;height:200px}</style></head><body>
      <h1>Local game fixture</h1><button id="spin">Test action</button><button id="popup" onclick="window.open('/popup')">Open popup</button><div id="status">idle</div>
      <input style="position:absolute;top:220px;left:200px" aria-label="Test input" id="input"><button hidden>Hidden trap</button>
      <iframe src="http://localhost:${server.address().port}/frame"></iframe><canvas width="400" height="200"></canvas><img src="/asset.svg">
      <div id="shadow" style="position:absolute;top:230px;left:500px"></div>
      <script>
      const c=document.querySelector('canvas');const ctx=c.getContext('2d');ctx.fillStyle='#406070';ctx.fillRect(0,0,400,200);ctx.fillStyle='white';ctx.font='24px sans-serif';ctx.fillText('Canvas fallback',45,100);
      const shadow=document.getElementById('shadow').attachShadow({mode:'open'});shadow.innerHTML='<button style="width:140px;height:45px">Shadow control</button>';
      let count=0; document.getElementById('spin').addEventListener('click',async()=>{count++;document.getElementById('status').textContent='clicked '+count;await fetch('/api/spin?token=fixture-secret',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer fixture-secret'},body:JSON.stringify({action:'spin',bet:10,token:'fixture-secret'})});});
      fetch('/api/init',{method:'POST',headers:{'content-type':'application/json'},body:'{"action":"init"}'});
      fetch('/api/form',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:'action=spin&bet=2&sid=fixture-secret'});
      fetch('/api/xml',{method:'POST',headers:{'content-type':'text/html'},body:'<request><action>init</action><session>fixture-secret</session></request>'});
      fetch('/missing');
      if(location.search.includes('hold=1'))fetch('/api/hold');
      const ws=new WebSocket('ws://127.0.0.1:${server.address().port}/socket?token=fixture-secret');ws.onopen=()=>{ws.send(JSON.stringify({action:'hello',token:'fixture-secret'}));ws.send(new Uint8Array([0,1,2,255]));};
      </script></body></html>`);
  });
  const wss=new WebSocketServer({server});
  wss.on('connection',ws=>{ws.on('message',(data,binary)=>ws.send(data,{binary}));});
  await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));
  return {url:`http://127.0.0.1:${server.address().port}`,received,close:async()=>{for(const ws of wss.clients) ws.terminate();await new Promise(r=>wss.close(r));server.closeAllConnections();await new Promise(r=>server.close(r));}};
}
