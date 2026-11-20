import { GitHubSync, DEFAULT_REPO, SyncError, syncDecision, validateProject } from './sync.mjs';
import { Library, LocalConflict, makeRecord, uuid, lockCredential, unlockCredential } from './library.mjs';

const $ = s => document.querySelector(s), editor = window.QabchinEditor, library = new Library();
const storage = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k,v) { try { localStorage.setItem(k,v); } catch {} }, del(k) { try { localStorage.removeItem(k); } catch {} } };
const CURRENT = 'qabchin-workspace-current', VAULT = 'qabchin-sync-vault';
let active = null, lastJSON = '', saveTimer, syncTimer, client = null, syncing = false, applying = false, ready = false, conflict = null, cloudBooks = [];
let saveQueue = Promise.resolve(), installPrompt = null, waitingWorker = null, lastError = '', resolving = false;
const date = value => new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('qabchin-books') : null;

const button = document.createElement('button');
button.id = 'workspaceBtn'; button.className = 'btn btn-soft workspace-button'; button.type = 'button';
button.title = 'کتابخانه و همگام‌سازی'; button.setAttribute('aria-label', 'کتابخانه و همگام‌سازی');
button.innerHTML = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v16H4zM14 4h6v16h-6zM4 8h6M14 8h6"/></svg><span class="button-copy">کتابخانه</span><i class="workspace-dot" id="syncDot"></i>';
$('.top-actions').prepend(button);
document.body.insertAdjacentHTML('beforeend', `
<dialog id="workspaceDialog" class="workspace-dialog" aria-labelledby="workspaceTitle"><div class="workspace-wrap">
  <header class="workspace-head"><div><h2 id="workspaceTitle">کتاب‌های من</h2><p>یک داستان؛ روی همهٔ دستگاه‌هایت.</p></div><button class="icon-btn" id="closeWorkspace" type="button" aria-label="بستن کتابخانه">✕</button></header>
  <div class="workspace-status" id="cloudStatus"><span class="workspace-dot" id="cloudDot"></span><p id="cloudStatusText" role="status" aria-live="polite">ذخیره روی همین دستگاه</p><button class="btn btn-soft sm" id="connectBtn" type="button">اتصال سینک</button><button class="btn btn-primary sm" id="syncNowBtn" type="button" hidden>سینک اکنون</button></div>
  <section class="sync-conflict" id="conflictBox" hidden><b>این کتاب در دو دستگاه تغییر کرده است</b><p>نسخهٔ شما محفوظ است. می‌توانید آن را به‌عنوان کتاب جدا نگه دارید یا پس از نگه‌داشتن یک کپی محلی، نسخهٔ ابری را باز کنید.</p><div class="workspace-tools"><button class="btn btn-primary" id="keepBothBtn" type="button">حفظ هر دو نسخه</button><button class="btn btn-soft" id="useCloudBtn" type="button">کپی محلی + دریافت ابری</button></div></section>
  <div class="workspace-tools"><button class="btn btn-primary" id="libraryNewBtn" type="button">+ کتاب تازه</button><button class="btn btn-soft" id="libraryImportBtn" type="button">ورود فایل پروژه</button><input id="bookSearch" type="search" placeholder="جست‌وجوی کتاب…" aria-label="جست‌وجوی کتاب"></div>
  <div id="bookGrid" class="book-grid" aria-live="polite"></div>
  <p id="libraryError" class="workspace-error" role="alert" hidden></p>
  <footer class="workspace-foot"><span>قاب‌چین وب · نسخهٔ ۲۷ · ذخیرهٔ آفلاین</span><div class="workspace-tools"><button class="btn btn-quiet sm" id="installBtn" type="button">نصب برنامه</button><button class="btn btn-soft sm" id="updateBtn" type="button" hidden>نسخهٔ تازه آماده است</button></div></footer>
</div></dialog>
<dialog id="connectionDialog" class="workspace-dialog" aria-labelledby="connectionTitle"><div class="workspace-wrap">
  <header class="workspace-head"><div><h2 id="connectionTitle">سینک شخصی</h2><p>ذخیرهٔ کتاب‌ها و تصویرها در مخزن خصوصی خودت</p></div><button class="icon-btn" id="closeConnection" type="button" aria-label="بستن اتصال">✕</button></header>
  <div class="connection-help" id="connectionHelp"><b>فقط بار اول روی هر دستگاه</b><ol><li>در صفحهٔ ساخت کلید، <b>Only select repositories</b> را انتخاب کن و فقط <code>qabchin-private-data</code> را علامت بزن.</li><li>مجوز <b>Contents: Read and write</b> کافی است؛ کلید را بساز و اینجا وارد کن.</li><li>برای نگهداری کلید روی این دستگاه، یک رمز محلی تعیین کن؛ کلید به‌شکل رمز‌شده ذخیره می‌شود.</li></ol><a id="createTokenLink" target="_blank" rel="noopener noreferrer">ساخت کلید محدود در GitHub ↗</a><p>کلید فقط به GitHub فرستاده می‌شود. آن را در چت یا فایل پروژه نگذار. هر دستگاه کلید خودش را می‌تواند داشته باشد.</p></div>
  <form id="connectionForm" class="connection-form">
    <label id="tokenLabel">کلید دسترسی محدود<input id="githubToken" type="password" autocomplete="off" spellcheck="false" dir="ltr" placeholder="github_pat_…"></label>
    <label class="check-line" id="rememberLabel"><input id="rememberToken" type="checkbox"> نگهداری رمز‌شده روی این دستگاه شخصی</label>
    <label id="vaultLabel" hidden>رمز بازکردن اتصال<input id="vaultPassword" type="password" autocomplete="current-password" minlength="8"></label>
    <p id="connectionError" class="workspace-error" role="alert" hidden></p>
    <div class="workspace-tools"><button class="btn btn-primary" id="connectionSubmit" type="submit">اتصال</button><button class="btn btn-soft" id="forgetConnectionBtn" type="button" hidden>فراموش‌کردن اتصال این دستگاه</button></div>
  </form>
</div></dialog>
<input type="file" accept=".json,application/json" id="libraryImport" hidden>`);
const tokenURL = new URL('https://github.com/settings/personal-access-tokens/new');
tokenURL.search = new URLSearchParams({ name: 'Qabchin personal sync', description: 'Private comic projects only — select qabchin-private-data', target_name: 'hadisaranjam', expires_in: '90', contents: 'write' }).toString();
$('#createTokenLink').href = tokenURL.href;

function status(text, kind = 'idle') {
  $('#cloudStatusText').textContent = text;
  for (const id of ['#cloudDot', '#syncDot']) $(id).dataset.state = kind;
  $('#cloudStatus').dataset.error = String(kind === 'error');
  $('#syncNowBtn').hidden = !client;
  $('#syncNowBtn').disabled = syncing;
  $('#connectBtn').textContent = client ? 'تنظیم اتصال' : storage.get(VAULT) ? 'بازکردن اتصال' : 'اتصال سینک';
}
function error(message) { lastError = message; $('#libraryError').textContent = message; $('#libraryError').hidden = !message; }
function notify(message) { editor.toast(message); }
function markActive(record) { active = record; storage.set(CURRENT, record.id); }
function dirty(record = active) { return record && record.revision !== record.syncedRevision; }
function changed() {
  if (!ready || applying) return;
  clearTimeout(saveTimer); saveTimer = setTimeout(() => flush().catch(localError), 1300);
}
function localError(e) {
  error(e.name === 'QuotaExceededError' ? 'فضای این دستگاه پر شده است. با «ذخیره» فایل پشتیبان بگیرید؛ سینک خودکار متوقف شد.' : 'ذخیرهٔ کتابخانه انجام نشد. با «ذخیره» فایل پشتیبان بگیرید.');
  status('ذخیرهٔ کتابخانه ناموفق بود', 'error');
}
function flush() {
  clearTimeout(saveTimer);
  const work = saveQueue.then(async () => {
    if (!ready || !active || applying) return active;
    const doc = editor.document(), json = JSON.stringify(doc);
    if (json === lastJSON) return active;
    let next = { ...active, doc, name: doc.name || 'کتاب بی‌نام', revision: uuid(), updatedAt: new Date().toISOString() };
    try { next = await library.save(next, active.revision); }
    catch (e) {
      if (!(e instanceof LocalConflict)) throw e;
      doc.name = `${doc.name || 'کتاب'} — کپی این زبانه`.slice(0,60);
      next = await library.save(makeRecord(doc));
      applying = true; try { editor.apply(doc); } finally { applying = false; }
      notify('نسخهٔ زبانهٔ دیگر محفوظ ماند؛ تغییرهای شما در یک کتاب جدا ذخیره شد.');
    }
    markActive(next); lastJSON = JSON.stringify(next.doc); channel?.postMessage({ id: next.id });
    if (!syncing && !conflict) status(client ? 'روی دستگاه ذخیره شد؛ در انتظار سینک' : 'روی این دستگاه ذخیره شد', client ? 'idle' : 'ok');
    if (client && !conflict) { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncCurrent(), 20000); }
    return next;
  });
  saveQueue = work.catch(() => {});
  return work;
}
async function openRecord(record) {
  if (syncing) return notify('تا پایان سینک صبر کنید.');
  await flush();
  applying = true;
  try { editor.apply(record.doc); markActive(record); lastJSON = JSON.stringify(editor.document()); }
  finally { applying = false; }
  editor.startAutosave(); conflict = null; $('#conflictBox').hidden = true;
  $('#workspaceDialog').close();
  status(client ? dirty() ? 'روی دستگاه؛ آمادهٔ سینک' : 'نسخهٔ سینک‌شده' : 'ذخیره روی همین دستگاه', 'ok');
  if (client) syncCurrent();
}
async function newBook() {
  if (syncing) return notify('تا پایان سینک صبر کنید.');
  await flush();
  const record = await library.save(makeRecord(editor.blank()));
  await openRecord(record); $('#projectName').focus();
}
function cover(doc) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 140'); svg.setAttribute('aria-hidden', 'true');
  const paper = document.createElementNS(svg.namespaceURI, 'rect');
  paper.setAttribute('width','100'); paper.setAttribute('height','140'); paper.setAttribute('rx','2'); paper.setAttribute('fill','#fff'); svg.append(paper);
  const pg = doc?.pages?.[0];
  for (const p of (pg?.panels || []).slice(0,6)) {
    const rect = document.createElementNS(svg.namespaceURI,'rect');
    rect.setAttribute('x', String(5 + p.x * .9)); rect.setAttribute('y', String(5 + p.y * 1.3));
    rect.setAttribute('width', String(Math.max(0,p.w * .9 - 1))); rect.setAttribute('height', String(Math.max(0,p.h * 1.3 - 1)));
    rect.setAttribute('fill', p.image ? '#8295d9' : '#e1e6f4'); rect.setAttribute('rx','1'); svg.append(rect);
  }
  if (!pg?.panels?.length) { const t = document.createElementNS(svg.namespaceURI,'text'); t.textContent = '+'; t.setAttribute('x','50'); t.setAttribute('y','80'); t.setAttribute('text-anchor','middle'); t.setAttribute('fill','#8993a9'); t.setAttribute('font-size','30'); svg.append(t); }
  return svg;
}
async function renderLibrary() {
  const books = await library.all(), ids = new Set(books.map(b => b.id));
  const all = [...books.map(b=>({ local:b })), ...cloudBooks.filter(b=>!ids.has(b.id)).map(b=>({ remote:b }))];
  const query = $('#bookSearch').value.trim().toLocaleLowerCase('fa');
  const grid = $('#bookGrid'); grid.replaceChildren();
  for (const item of all) {
    const b = item.local || item.remote, name = b.name || b.doc?.name || 'کتاب بی‌نام';
    if (query && !name.toLocaleLowerCase('fa').includes(query)) continue;
    const card = document.createElement('article'); card.className = 'book-card'; card.dataset.active = String(b.id === active?.id);
    const face = document.createElement('div'); face.className = 'book-cover'; face.append(cover(b.doc));
    const badge = document.createElement('span'); badge.className = 'cloud-badge'; badge.textContent = item.remote ? 'ابری' : b.id === active?.id ? 'کتاب باز' : dirty(b) ? 'محلی' : 'سینک‌شده'; face.append(badge);
    const info = document.createElement('div'); info.className = 'book-info';
    const h = document.createElement('h3'); h.textContent = name; h.title = name;
    const meta = document.createElement('p'); meta.className = 'book-meta'; meta.textContent = `${new Intl.NumberFormat('fa').format(b.doc?.pages?.length || 0)} صفحه · ${date(b.updatedAt)}`;
    const actions = document.createElement('div'); actions.className = 'book-actions';
    const open = document.createElement('button'); open.type='button'; open.className='btn btn-soft'; open.textContent=item.remote?'دریافت و بازکردن':'بازکردن'; open.disabled=syncing;
    open.onclick=()=>guard(()=>item.remote?downloadBook(b):openRecord(b)); actions.append(open);
    if (item.local) {
      const duplicate=document.createElement('button'); duplicate.type='button'; duplicate.className='btn btn-quiet'; duplicate.textContent='کپی'; duplicate.disabled=syncing;
      duplicate.onclick=()=>guard(async()=>{await flush();const src=await library.read(b.id);const doc=structuredClone(src.doc);doc.name=`${doc.name||'کتاب'} — کپی`.slice(0,60);await library.save(makeRecord(doc));await renderLibrary();}); actions.append(duplicate);
    }
    info.append(h,meta,actions);card.append(face,info);grid.append(card);
  }
  if (!grid.children.length) {const e=document.createElement('p');e.className='workspace-empty';e.textContent=query?'کتابی با این نام پیدا نشد.':'اولین کتابت را بساز یا فایل پروژهٔ قبلی را وارد کن.';grid.append(e);}
}
async function guard(fn) { try { error(''); return await fn(); } catch(e) { error(e.message || 'این کار انجام نشد؛ دوباره تلاش کنید.'); } }
async function showLibrary() { await flush(); await renderLibrary(); if(!$('#workspaceDialog').open)$('#workspaceDialog').showModal(); }
function showConnection() {
  const locked=!!storage.get(VAULT);
  $('#connectionHelp').hidden=locked; $('#tokenLabel').hidden=locked; $('#rememberLabel').hidden=locked;
  $('#vaultLabel').hidden=!locked && !$('#rememberToken').checked;
  $('#forgetConnectionBtn').hidden=!locked && !client;
  $('#connectionSubmit').textContent=locked?'بازکردن اتصال':'اتصال';
  $('#githubToken').value='';$('#vaultPassword').value='';$('#connectionError').hidden=true;
  $('#connectionDialog').showModal();
}
async function connect(event) {
  event.preventDefault();const submit=$('#connectionSubmit');submit.disabled=true;
  try {
    let credentials;
    const vault=storage.get(VAULT), password=$('#vaultPassword').value;
    if(vault) credentials=await unlockCredential(JSON.parse(vault),password);
    else {
      const token=$('#githubToken').value.trim();
      if(!token.startsWith('github_pat_'))throw new Error('از کلید محدود با پیشوند github_pat_ استفاده کنید.');
      credentials={token,repo:DEFAULT_REPO};
    }
    const next=new GitHubSync({...credentials,progress:message=>status(message,'busy')});
    await next.verify();
    if(!vault && $('#rememberToken').checked){const encrypted=await lockCredential(credentials,password);storage.set(VAULT,JSON.stringify(encrypted));}
    client=next;$('#githubToken').value='';$('#vaultPassword').value='';$('#connectionDialog').close();
    status('اتصال برقرار شد؛ دریافت فهرست کتاب‌ها…','busy');
    await refreshCloud();await showLibrary();
    if(active?.doc.pages.some(p=>p.panels.length)||active?.doc.name) await syncCurrent();
    else status('متصل؛ کتاب‌های ابری را می‌توانید باز کنید','ok');
  }catch(e){$('#connectionError').textContent=e.message;$('#connectionError').hidden=false;}
  finally{submit.disabled=false;}
}
async function refreshCloud(){if(!client)return;cloudBooks=await client.list();await renderLibrary();}
function setConflict(record,remote){conflict={id:record.id,remote};$('#conflictBox').hidden=false;status('تداخل نسخه‌ها؛ هر دو نسخه محفوظ‌اند','error');}
async function syncWork() {
  if(!client||syncing||!active||conflict)return;
  if(!navigator.onLine){status('آفلاین؛ تغییرها روی این دستگاه محفوظ‌اند','idle');return;}
  syncing=true;clearTimeout(syncTimer);status('در حال سینک…','busy');
  try {
    await flush();const local=await library.read(active.id), remote=await client.getMeta(local.id);
    const action=syncDecision(local,remote?.sha);
    if(action==='conflict'){setConflict(local,remote);await showLibrary();return;}
    if(action==='pull'){
      const doc=await client.pull(remote);
      await flush();const latest=await library.read(local.id);
      if(latest.revision!==local.revision){setConflict(latest,remote);await showLibrary();return;}
      const record={...makeRecord(doc,local.id),revision:remote.revision,syncedRevision:remote.revision,remoteSha:remote.sha};
      await library.save(record,latest.revision);
      // save() retains the previous sync metadata, so mark the remote revision atomically.
      const saved=await library.markSynced(record.id,record.revision,remote.sha);
      applying=true;try{editor.apply(doc);markActive(saved);lastJSON=JSON.stringify(editor.document());}finally{applying=false;}
    } else if(action==='push'){
      if(!local.doc.name&&!local.doc.pages.some(p=>p.panels.length)){status('متصل؛ کتاب تازه هنوز خالی است','ok');return;}
      const result=await client.push(local);
      const saved=await library.markSynced(local.id,local.revision,result.sha);
      if(active.id===saved.id)active={...active,remoteSha:saved.remoteSha,syncedRevision:saved.syncedRevision,syncedAt:saved.syncedAt};
      cloudBooks=cloudBooks.filter(b=>b.id!==local.id);cloudBooks.push(result);
    }
    await flush();
    status(dirty()?'نسخهٔ ارسال‌شده محفوظ است؛ تغییرهای تازه در انتظار سینک':`سینک شد · ${new Intl.DateTimeFormat('fa',{hour:'2-digit',minute:'2-digit'}).format(new Date())}`,dirty()?'idle':'ok');
    if(dirty())syncTimer=setTimeout(()=>syncCurrent(),20000);
    error('');channel?.postMessage({id:active.id});
  }catch(e){
    if(e.code==='conflict'){try{setConflict(active,await client.getMeta(active.id));await showLibrary();}catch{status(e.message,'error');}}
    else {status(e.message||'سینک کامل نشد؛ نسخهٔ محلی محفوظ است.','error');if(e.code==='auth')client=null;}
  }finally{syncing=false;$('#syncNowBtn').disabled=false;if($('#workspaceDialog').open)await renderLibrary();}
}
async function syncCurrent(){
  if(navigator.locks) return navigator.locks.request('qabchin-github-sync',{ifAvailable:true},lock=>lock?syncWork():status('سینک در زبانهٔ دیگر در حال انجام است'));
  return syncWork();
}
async function downloadBook(meta){
  if(syncing)return;await flush();syncing=true;status('در حال دریافت کتاب…','busy');
  try{const fresh=await client.getMeta(meta.id);if(!fresh)throw new Error('پروژهٔ ابری دیگر موجود نیست.');const doc=await client.pull(fresh);const r={...makeRecord(doc,meta.id),revision:fresh.revision,remoteSha:fresh.sha,syncedRevision:fresh.revision};await library.save(r);syncing=false;await openRecord(r);}
  finally{syncing=false;$('#syncNowBtn').disabled=false;}
}
async function resolveConflict(useCloud){
  if(!conflict||syncing||resolving)return;resolving=true;
  $('#keepBothBtn').disabled=$('#useCloudBtn').disabled=true;
  try {
    await flush();const original=await library.read(conflict.id);
    const copyDoc=structuredClone(original.doc);copyDoc.name=`${copyDoc.name||'کتاب'} — نسخهٔ این دستگاه`.slice(0,60);
    const copy=await library.save(makeRecord(copyDoc));let cloudRecord=null;
    if(conflict.remote){
      const remote=await client.getMeta(original.id);if(!remote)throw new Error('نسخهٔ ابری پیدا نشد؛ کپی محلی شما محفوظ است.');
      const doc=await client.pull(remote);
      await flush();const latest=await library.read(original.id);
      if(latest.revision!==original.revision)throw new Error('کتاب هنگام دریافت تغییر کرد؛ دوباره انتخاب کنید. کپی قبلی محفوظ است.');
      const record={...makeRecord(doc,original.id),revision:remote.revision,remoteSha:remote.sha,syncedRevision:remote.revision};
      await library.save(record,original.revision);cloudRecord=await library.markSynced(record.id,record.revision,remote.sha);
      // The active in-memory revision must match the restored library record before switching.
      applying=true;try{editor.apply(doc);markActive(cloudRecord);lastJSON=JSON.stringify(editor.document());}finally{applying=false;}
    }
    conflict=null;$('#conflictBox').hidden=true;await openRecord(useCloud&&cloudRecord?cloudRecord:copy);
    notify('هر دو نسخه نگه داشته شدند.');
  } finally {resolving=false;$('#keepBothBtn').disabled=$('#useCloudBtn').disabled=false;}
}
async function importFile(file){
  if(!file)return;if(file.size>500*1024*1024)throw new Error('فایل پروژه بیش از ۵۰۰ مگابایت است.');
  const doc=JSON.parse(await file.text());doc.assets ||= {};
  for(const pg of doc.pages||[])for(const pn of pg.panels||[])if(pn.image?.dataUrl){pn.image.assetId ||= uuid();doc.assets[pn.image.assetId]=pn.image.dataUrl;delete pn.image.dataUrl;}
  validateProject(doc);await flush();
  const before=editor.document();applying=true;
  try{editor.apply(doc);}catch(e){editor.apply(before);throw e;}finally{applying=false;}
  const normalized=editor.document();
  try{const record=await library.save(makeRecord(normalized));markActive(record);lastJSON=JSON.stringify(normalized);}
  catch(e){applying=true;try{editor.apply(before);}finally{applying=false;}throw e;}
  $('#workspaceDialog').close();editor.startAutosave();notify('پروژه به‌عنوان یک کتاب تازه وارد شد.');if(client)syncCurrent();
}

button.onclick=()=>guard(showLibrary);$('#closeWorkspace').onclick=()=>$('#workspaceDialog').close();
$('#connectBtn').onclick=showConnection;$('#closeConnection').onclick=()=>$('#connectionDialog').close();
$('#connectionForm').onsubmit=connect;$('#rememberToken').onchange=()=>$('#vaultLabel').hidden=!$('#rememberToken').checked;
$('#forgetConnectionBtn').onclick=async()=>{if(syncing)return;client=null;storage.del(VAULT);cloudBooks=[];clearTimeout(syncTimer);$('#connectionDialog').close();status('اتصال این دستگاه فراموش شد؛ کتاب‌های محلی محفوظ‌اند');await renderLibrary();};
$('#syncNowBtn').onclick=()=>guard(async()=>{await syncCurrent();await refreshCloud();});
$('#libraryNewBtn').onclick=()=>guard(newBook);$('#libraryImportBtn').onclick=()=>$('#libraryImport').click();
$('#libraryImport').onchange=e=>{const file=e.target.files[0];e.target.value='';guard(()=>importFile(file));};
$('#bookSearch').oninput=()=>guard(renderLibrary);
$('#keepBothBtn').onclick=()=>guard(()=>resolveConflict(false));$('#useCloudBtn').onclick=()=>guard(()=>resolveConflict(true));
// In the web app, creating/importing a book always preserves the previous library entry.
const oldNew=$('#newProjectBtn'), newButton=oldNew.cloneNode(true);oldNew.replaceWith(newButton);newButton.onclick=()=>guard(newBook);
const oldLoad=$('#loadProjectBtn'), loadButton=oldLoad.cloneNode(true);oldLoad.replaceWith(loadButton);loadButton.onclick=()=>$('#libraryImport').click();
window.addEventListener('qabchin:change',changed);
window.addEventListener('offline',()=>status('آفلاین؛ کار روی همین دستگاه ادامه دارد'));
window.addEventListener('online',()=>{if(client)syncCurrent();else status('آنلاین؛ برای سینک اتصال را باز کنید');});
window.addEventListener('beforeunload',event=>{if(ready&&active&&JSON.stringify(editor.document())!==lastJSON){event.preventDefault();event.returnValue='';}});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush().catch(localError);else if(client)syncCurrent();});
channel?.addEventListener('message',()=>{if($('#workspaceDialog').open)renderLibrary().catch(localError);});
setInterval(()=>{if(client&&document.visibilityState==='visible')syncCurrent();},60000);
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
$('#installBtn').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;}else notify('در آیفون: Share ← Add to Home Screen. در اندروید یا رایانه: از منوی مرورگر «نصب برنامه» را بزنید.');};
window.addEventListener('appinstalled',()=>{$('#installBtn').hidden=true;notify('قاب‌چین نصب شد.');});
$('#updateBtn').onclick=()=>guard(async()=>{await flush();if(waitingWorker)waitingWorker.postMessage('APPLY_UPDATE');});
if('serviceWorker' in navigator && location.protocol!=='file:'){
  let reloading=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(reloading)return;reloading=true;if(waitingWorker)location.reload();});
  navigator.serviceWorker.register('./sw.js').then(reg=>{
    const found=()=>{if(reg.waiting){waitingWorker=reg.waiting;$('#updateBtn').hidden=false;}};found();
    reg.addEventListener('updatefound',()=>reg.installing?.addEventListener('statechange',found));
  }).catch(()=>notify('نصب آفلاین کامل نشد؛ یک‌بار دیگر در حالت آنلاین برنامه را باز کنید.'));
}
await editor.ready;
try{
  const currentId=storage.get(CURRENT), stored=currentId?await library.read(currentId):null;
  if(stored){applying=true;try{editor.apply(stored.doc);markActive(stored);}finally{applying=false;}}
  else {if(currentId)await editor.recoverLegacy();markActive(await library.save(makeRecord(editor.document())));}
  lastJSON=JSON.stringify(editor.document());ready=true;editor.startAutosave();
  status(navigator.onLine?(storage.get(VAULT)?'کتاب‌ها محلی‌اند؛ برای سینک اتصال را باز کنید':'ذخیره روی این دستگاه؛ سینک هنوز متصل نیست'):'آفلاین؛ کتاب‌ها روی این دستگاه محفوظ‌اند');
  await renderLibrary();
}catch(e){localError(e);editor.startAutosave();}
// Testable public surface contains no credentials.
window.QabchinWorkspace={flush,ready:()=>ready,open:showLibrary,newBook,importFile,activeId:()=>active?.id};
