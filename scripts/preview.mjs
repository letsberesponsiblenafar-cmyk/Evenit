import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, extname, sep} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.json':'application/json'};
http.createServer(async(req,res)=>{
  try{
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const file=resolve(root,'.'+(path==='/'?'/index.html':path));
    if(!file.startsWith(root+sep)||!types[extname(file)]||path.includes('/.')||path.includes('/node_modules/')){res.writeHead(404);res.end();return;}
    const body=await readFile(file);
    res.writeHead(200,{'Content-Type':types[extname(file)]+'; charset=utf-8','Cache-Control':'no-store'});
    res.end(body);
  }catch{res.writeHead(404);res.end();}
}).listen(4173,'127.0.0.1',()=>console.log('Evenit preview: http://127.0.0.1:4173'));
