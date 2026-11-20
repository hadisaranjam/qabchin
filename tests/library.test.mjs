import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import {Library,LocalConflict,makeRecord,lockCredential,unlockCredential} from '../web/library.mjs';
import {sampleDoc} from './github-fixture.mjs';
test('library retains project name and images after reopening',async()=>{
  const a=new Library(),r=makeRecord(sampleDoc());await a.save(r);const b=new Library();assert.deepEqual(await b.read(r.id),r);
});
test('stale tab cannot overwrite another tab, and records are isolated',async()=>{
  const a=new Library(),r=makeRecord(sampleDoc());await a.save(r);await a.save({...r,revision:'new'},r.revision);
  await assert.rejects(()=>a.save({...r,revision:'stale'},r.revision),LocalConflict);assert.equal((await a.read(r.id)).revision,'new');
});
test('edit during upload remains dirty after uploaded revision is acknowledged',async()=>{
  const a=new Library(),r=makeRecord(sampleDoc());await a.save(r);await a.save({...r,revision:'edited-during-upload'},r.revision);
  const saved=await a.markSynced(r.id,r.revision,'cloud-sha');assert.equal(saved.revision,'edited-during-upload');assert.equal(saved.syncedRevision,r.revision);assert.equal(saved.remoteSha,'cloud-sha');
});
test('credential vault contains no plaintext and rejects wrong password/tampering',async()=>{
  const secret={token:'github_pat_test_secret',repo:'owner/private'},vault=await lockCredential(secret,'correct-password');
  assert.ok(!JSON.stringify(vault).includes(secret.token));assert.deepEqual(await unlockCredential(vault,'correct-password'),secret);
  await assert.rejects(()=>unlockCredential(vault,'incorrect-password'));await assert.rejects(()=>lockCredential(secret,'short'));
  const damaged={...vault,cipher:vault.cipher.slice(0,-10)+'AAAAAAAAAA'};await assert.rejects(()=>unlockCredential(damaged,'correct-password'));
});
