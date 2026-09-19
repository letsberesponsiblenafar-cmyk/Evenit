import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const start=source.indexOf('function cameraTimeoutError(');
const end=source.indexOf('async function verifyScannedToken(',start);
if(start<0||end<0)throw new Error('Camera helpers were not found');
const context=vm.createContext({Promise,setTimeout,clearTimeout,Error});
vm.runInContext(source.slice(start,end),context);

test('camera startup returns when the scanner becomes ready',async()=>{
  assert.equal(await context.withCameraTimeout(Promise.resolve('ready'),50),'ready');
});

test('camera startup cannot remain on Starting camera forever',async()=>{
  await assert.rejects(context.withCameraTimeout(new Promise(()=>{}),15),error=>error.name==='CameraTimeoutError');
});

test('camera selection prefers a rear-facing device',()=>{
  const selected=context.preferredCamera([{id:'front',label:'Front camera'},{id:'rear',label:'Camera2 0, back'}]);
  assert.equal(selected.id,'rear');
});

test('scanner result elements use selectors that exist in the page',()=>{
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  assert.match(html,/id="scan-result"[\s\S]*?class="scan-result-icon"/);
  assert.match(source,/querySelector\('#scan-result \.scan-result-icon'\)/);
});
