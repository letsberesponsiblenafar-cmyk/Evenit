// Local-only UI review with synthetic data. No Supabase requests are made.
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json','.png':'image/png','.ttf':'font/ttf'};
http.createServer(async(req,res)=>{
  try{
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=resolve(root,'.'+(path==='/'?'/index.html':path));
    if(!file.startsWith(root+sep)||!types[extname(file)]||path.includes('/.')||path.includes('/node_modules/')){res.writeHead(404);res.end();return;}
    let body=await readFile(path==='/supabase-config.js'?resolve(root,'scripts/ui-fixture.js'):file);
    if(extname(file)==='.html')body=Buffer.from(body.toString().replace('<body>','<body><div style="padding:8px;text-align:center;background:#fff2c5;color:#443600;font:12px sans-serif">Local UI test · synthetic events and accounts</div>'));
    res.writeHead(200,{'Content-Type':types[extname(file)],'Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end();}
}).listen(4174,'127.0.0.1',()=>console.log('Evenit fixture preview: http://127.0.0.1:4174'));
