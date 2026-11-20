import test from 'node:test';
import assert from 'node:assert/strict';
import {GitHubSync,syncDecision,encodeJSON,decodeJSON,validateProject} from '../web/sync.mjs';
import {createGitHubFixture,sampleDoc} from './github-fixture.mjs';
const makeClient=f=>new GitHubSync({token:'test-only',fetcher:f.fetcher});
test('Persian names and Unicode round-trip without loss',()=>{const doc=sampleDoc('کتاب 🖼️ یک');assert.deepEqual(decodeJSON(encodeJSON(doc)),doc);});
test('private cloud: upload, list, download identical images and metadata',async()=>{
  const f=createGitHubFixture(),a=makeClient(f),doc=sampleDoc();
  const result=await a.push({id:'test-book-one',doc,revision:'rev1',remoteSha:null});
  assert.ok(result.sha);assert.equal((await a.list()).length,1);
  const b=makeClient(f),meta=await b.getMeta('test-book-one');assert.deepEqual(JSON.parse(JSON.stringify(await b.pull(meta))),doc);
  assert.equal([...f.files.keys()].filter(k=>k.startsWith('assets/')).length,1);
  const writes=f.calls.filter(c=>c.method==='PUT').length;
  doc.name='ویرایش تازه';await a.push({id:'test-book-one',doc,revision:'rev2',remoteSha:result.sha});
  assert.equal(f.calls.filter(c=>c.method==='PUT').length,writes+1,'unchanged images are not uploaded twice');
});
test('stale device cannot overwrite cloud book; originals remain intact',async()=>{
  const f=createGitHubFixture(),a=makeClient(f),b=makeClient(f),first=await a.push({id:'test-book-one',doc:sampleDoc(),revision:'one'});
  await a.push({id:'test-book-one',doc:sampleDoc('نسخهٔ دستگاه اول'),revision:'two',remoteSha:first.sha});
  await assert.rejects(()=>b.push({id:'test-book-one',doc:sampleDoc('نسخهٔ دستگاه دوم'),revision:'three',remoteSha:first.sha}),e=>e.code==='conflict');
  assert.equal((await a.getMeta('test-book-one')).name,'نسخهٔ دستگاه اول');
});
test('public repository is rejected before any upload',async()=>{
  const f=createGitHubFixture();f.setPrivate(false);await assert.rejects(()=>makeClient(f).push({id:'test-book-one',doc:sampleDoc(),revision:'one'}),e=>e.code==='privacy');assert.equal(f.calls.filter(c=>c.method==='PUT').length,0);
});
test('invalid images and broken project references are rejected',()=>{
  const d=sampleDoc();delete d.assets['image-one'];assert.throws(()=>validateProject(d));assert.throws(()=>validateProject({pages:[]}));
});
test('cloud image links cannot direct authentication to another host',async()=>{
  const f=createGitHubFixture(),a=makeClient(f),doc=sampleDoc();doc.assets['image-one']={path:'https://example.com/steal',mime:'image/png'};
  await assert.rejects(()=>a.pull({doc}),e=>e.code==='invalid');assert.ok(f.calls.every(c=>new URL(c.url).hostname==='api.github.com'));
});
test('corrupted cloud image fails hash validation',async()=>{
  const f=createGitHubFixture(),a=makeClient(f),r=await a.push({id:'test-book-one',doc:sampleDoc(),revision:'r1'});
  const path=Object.values(r.doc.assets)[0].path;f.put(path,Buffer.from('corrupt'));await assert.rejects(()=>a.pull(r),e=>e.code==='invalid');
});
test('network/auth failures are explicit and never report success',async()=>{
  const f=createGitHubFixture();f.setDenied(401);await assert.rejects(()=>makeClient(f).verify(),e=>e.code==='auth');
  const a=new GitHubSync({token:'test',fetcher:async()=>{throw new Error('offline');}});await assert.rejects(()=>a.verify(),e=>e.code==='network');
});
test('synchronization decision matrix preserves simultaneous edits and deletions',()=>{
  assert.equal(syncDecision({revision:'a'},null),'push');
  assert.equal(syncDecision({revision:'a'},'remote'),'conflict');
  assert.equal(syncDecision({revision:'a',syncedRevision:'a',remoteSha:'old'},null),'conflict');
  assert.equal(syncDecision({revision:'a',syncedRevision:'a',remoteSha:'old'},'new'),'pull');
  assert.equal(syncDecision({revision:'b',syncedRevision:'a',remoteSha:'old'},'new'),'conflict');
  assert.equal(syncDecision({revision:'b',syncedRevision:'a',remoteSha:'old'},'old'),'push');
  assert.equal(syncDecision({revision:'a',syncedRevision:'a',remoteSha:'old'},'old'),'same');
});
