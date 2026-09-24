import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const css=readFileSync(new URL('../refinement.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('aftermath media renders as one-item scroll-snap carousel with dots',()=>{
  assert.match(app,/function renderAftermathMedia\(post\)/);
  assert.match(app,/data-aftermath-carousel/);
  assert.match(app,/data-carousel-slide/);
  assert.match(app,/data-carousel-dot/);
  assert.match(app,/function wireAftermathCarousels\(scope=document\)/);
  assert.match(css,/scroll-snap-type:\s*x mandatory/);
  assert.match(css,/\.aftermath-carousel \.aftermath-media-item[^}]+flex:\s*0 0 100%/s);
  assert.match(css,/object-fit:\s*contain !important/);
});

test('event details collect and render all aftermath posts linked to the event',()=>{
  assert.match(app,/async function loadEventAftermath\(planId,plan=\{\}\)/);
  assert.match(app,/rpc\('get_aftermath_for_plan'/);
  assert.match(app,/renderAftermathCards\(eventAftermath,\{showEventContext:false\}\)/);
  assert.match(app,/class="public-event-aftermath"/);
});

test('authored paragraphs and attachment previews are preserved',()=>{
  assert.match(css,/white-space:\s*pre-wrap/);
  assert.match(html,/id="aftermath-file-list" class="aftermath-file-preview"/);
  assert.match(app,/URL\.createObjectURL\(file\)/);
  assert.match(app,/aftermathDraftFiles\.length<10/);
  assert.match(app,/function mountAftermathPage\(/);
  assert.match(app,/type:'aftermath-page'/);
  assert.match(app,/window\.history\.back\(\)/);
  assert.match(css,/\.aftermath-composer\.aftermath-page-surface/);
  assert.doesNotMatch(app,/else if\(overlay\.id==='aftermath-modal'\)closeAftermathComposer\(\)/);
});
