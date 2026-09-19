import {readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

const root=resolve(import.meta.dirname,'..');
const files=['.','scripts'].flatMap(directory=>readdirSync(resolve(root,directory),{withFileTypes:true})
  .filter(entry=>entry.isFile()&&/\.(?:m?js)$/.test(entry.name))
  .map(entry=>resolve(root,directory,entry.name)));
for(const file of files){
  const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
console.log(`Syntax checked ${files.length} JavaScript files.`);
