import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

const root=new URL('../',import.meta.url);
const read=path=>readFileSync(new URL(path,root),'utf8');
const app=read('app.js');
const css=read('refinement.css');
const html=read('index.html');
const manifest=JSON.parse(read('site.webmanifest'));
const androidManifest=read('android/app/src/main/AndroidManifest.xml');

test('the supplied Abask face owns the lowercase evenit wordmark',()=>{
  assert.ok(existsSync(new URL('assets/fonts/abask-regular.ttf',root)));
  assert.match(css,/@font-face[\s\S]*font-family: 'Abask'/);
  assert.match(css,/--font-brand: 'Abask'/);
  assert.match(html,/>evenit</);
});

test('web and installed-app artwork use the generated evenit identity',()=>{
  for(const path of ['assets/brand/favicon-32.png','assets/brand/favicon-192.png','assets/brand/favicon-512.png','assets/brand/apple-touch-icon.png']){
    const image=readFileSync(new URL(path,root));
    assert.equal(image.toString('ascii',1,4),'PNG');
  }
  assert.match(html,/site\.webmanifest/);
  assert.equal(manifest.name,'evenit');
  assert.equal(manifest.icons.length,2);
  assert.match(androidManifest,/@mipmap\/ic_launcher/);
});

test('Android and iOS builds are both visible without cross-platform update prompts',()=>{
  assert.match(app,/releases\/latest\/download\/Evenit\.apk/);
  assert.match(app,/actions\/workflows\/ios-build\.yml/);
  assert.match(app,/getPlatform\?\.\(\)!=='android'/);
});
