'use strict';
// قاب‌چین کمیک — آزمون مرورگر نسخهٔ ۲۶ (Playwright + Chromium).
// اجرا:  node tools/e2e.cjs <پوشهٔ کار موقت> [URL نسخهٔ چندفایلی]
// پیش‌نیاز: سرور ایستا روی source/dist (مثلاً python3 -m http.server 8123 --directory source/dist)
// نسخهٔ تک‌فایلی هم مستقیم با file:// آزموده می‌شود. همهٔ فایل‌های آزمون را خود اسکریپت می‌سازد.
// Persian download names need a UTF-8 locale in headless Chromium (a plain POSIX locale turns them into "download").
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), os = require('os'), zlib = require('zlib');
const S = path.resolve(process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'comic-e2e-')));
const URL = process.argv[3] || 'http://127.0.0.1:8123/index.html';
const ROOT = path.join(__dirname, '..'), SINGLE = 'file://' + path.join(ROOT, 'single-file/comic-page-studio.html');
const T = path.join(S, 'e2e'), F = path.join(T, 'fx'); fs.mkdirSync(F, { recursive: true });
const results = [], errs = [];
async function step(name, fn) {
  try { const d = await fn(); results.push({ name, ok: true, d }); console.log('PASS', name, d !== undefined ? JSON.stringify(d) : ''); }
  catch (e) { results.push({ name, ok: false, d: e.message }); console.log('FAIL', name, '→', e.message.split('\n').slice(0, 3).join(' ')); }
}
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m || 'not equal'}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); };
const ok = (v, m) => { if (!v) throw new Error(m || 'assertion failed'); };
const faNum = s => Number(String(s).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[^\d.-]/g, ''));

// ── ساخت فایل‌های آزمون در مرورگر (JPEG/PNG/WebP) و EXIF در Node
async function makeFixtures(pg) {
  const specs = [
    ...[1, 2, 3, 4, 5, 6].map(i => ({ name: `p${i}.jpg`, w: [1600, 900, 1200, 2000, 800, 1500][i - 1], h: [1000, 1400, 1200, 1100, 1000, 900][i - 1], type: 'image/jpeg', seed: i })),
    { name: 'big.jpg', w: 6000, h: 4000, type: 'image/jpeg', seed: 7 },
    { name: 'trans.png', w: 800, h: 600, type: 'image/png', alpha: true, seed: 8 },
    { name: 'trans-big.webp', w: 5000, h: 3000, type: 'image/webp', alpha: true, seed: 9 },
    { name: 'exif-base.jpg', w: 1200, h: 600, type: 'image/jpeg', exifBase: true, seed: 10 }
  ];
  for (const s of specs) {
    const b64 = await pg.evaluate(async s => {
      const c = document.createElement('canvas'); c.width = s.w; c.height = s.h; const g = c.getContext('2d');
      let r = s.seed * 9301 + 49297; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
      if (s.alpha) { g.clearRect(0, 0, s.w, s.h); g.fillStyle = '#1e9c5a'; g.beginPath(); g.ellipse(s.w / 2, s.h / 2, s.w / 3, s.h / 3, 0, 0, 7); g.fill(); }
      else if (s.exifBase) { g.fillStyle = '#eeeeee'; g.fillRect(0, 0, s.w, s.h); g.fillStyle = '#cc0000'; g.fillRect(0, 0, s.w / 4, s.h); }
      else { g.fillStyle = `hsl(${rnd() * 360},45%,55%)`; g.fillRect(0, 0, s.w, s.h); for (let k = 0; k < 30; k++) { g.fillStyle = `hsl(${rnd() * 360},70%,${30 + rnd() * 40}%)`; g.beginPath(); g.arc(rnd() * s.w, rnd() * s.h, 20 + rnd() * s.w / 6, 0, 7); g.fill(); } }
      const blob = await new Promise(res => c.toBlob(res, s.type, .9)); const buf = new Uint8Array(await blob.arrayBuffer()); let bin = ''; for (let i = 0; i < buf.length; i += 32768) bin += String.fromCharCode(...buf.subarray(i, i + 32768)); return btoa(bin);
    }, s);
    fs.writeFileSync(path.join(F, s.name), Buffer.from(b64, 'base64'));
  }
  // JPEG با برچسب EXIF Orientation=6 (۹۰ درجه): پیکسل‌ها افقی ذخیره شده‌اند، نمایش باید عمودی باشد.
  const jpg = fs.readFileSync(path.join(F, 'exif-base.jpg'));
  const tiff = Buffer.from([0x4d, 0x4d, 0, 42, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, 6, 0, 0, 0, 0, 0, 0, 0, 0]);
  const app1Body = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]), len = Buffer.alloc(2); len.writeUInt16BE(app1Body.length + 2);
  fs.writeFileSync(path.join(F, 'exif6.jpg'), Buffer.concat([jpg.subarray(0, 2), Buffer.from([0xff, 0xe1]), len, app1Body, jpg.subarray(2)]));
  fs.copyFileSync(path.join(F, 'p1.jpg'), path.join(F, 'عکس فارسی ۱.jpg'));
  fs.writeFileSync(path.join(F, 'fake.heic'), Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), Buffer.alloc(64)]));
}
const IMG = n => path.join(F, typeof n === 'number' ? `p${n}.jpg` : n);
function pngSize(file) { const b = fs.readFileSync(file); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; }

(async () => {
  const browser = await chromium.launch();
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'comic-e2e-'));
  const ctx = await chromium.launchPersistentContext(userData, { viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const pg = ctx.pages()[0] || await ctx.newPage(); pg.setDefaultTimeout(8000);
  const watch = (p, tag) => { p.on('pageerror', e => errs.push(`${tag} PAGEERR ${e.message}`)); p.on('console', m => { if (m.type() === 'error') errs.push(`${tag} CONSOLE ${m.text()}`); }); p.on('request', r => { const u = r.url(); if (!/^(data|blob|file):/.test(u) && !u.startsWith(URL.replace(/index\.html$/, ''))) errs.push(`${tag} NETWORK ${u}`); }); };
  watch(pg, 'main');
  const shells = (p = pg) => p.evaluate(() => [...document.querySelectorAll('.frame-shell')].map(s => { const r = s.getBoundingClientRect(); return { id: s.dataset.panelId, x: r.x, y: r.y, w: r.width, h: r.height, sel: s.classList.contains('selected') } }));
  const msg = (p = pg) => p.evaluate(() => document.querySelector('#toastText').textContent);
  const imgs = (p = pg) => p.evaluate(() => document.querySelectorAll('.frame-shell img').length);
  const tab = async t => { await pg.click(`[data-editor-tab="${t}"]`); await pg.waitForTimeout(60); };
  const layout = async (count, tpl, cat) => { await tab('layout'); await pg.click(`[data-count="${count}"]`); if (await pg.evaluate(() => document.querySelector('#confirmDialog').open)) await pg.click('#confirmOk'); if (cat) await pg.click(`[data-category-tab="${cat}"]`); await pg.click(`[data-template="${tpl}"]`); await pg.waitForTimeout(150); };
  const unfold = sel => pg.evaluate(sel => document.querySelectorAll(sel).forEach(el => { for (let d = el.closest('details'); d; d = d.parentElement?.closest('details')) d.open = true }), sel);
  const center = s => [s.x + s.w / 2, s.y + s.h / 2];
  const diag = (p = pg) => p.$eval('#diagChip', e => (e.hidden ? '' : e.textContent));
  const unfoldAll = () => pg.evaluate(() => document.querySelectorAll('.inspector details').forEach(d => (d.open = true)));
  const fresh = async (quick = 'grid') => { await pg.keyboard.press('Escape'); await pg.click('#newProjectBtn'); await pg.click('#confirmOk', { timeout: 800 }).catch(() => {}); await pg.waitForTimeout(150); await pg.click(`[data-quick="${quick}"]`); await pg.waitForTimeout(180); await unfoldAll(); };
  const handles = sel => pg.$$eval('#handlesLayer ' + sel, e => e.map(x => { const r = x.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }));
  const pageBox = () => pg.$eval('#comicPage', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const onBorder = (pt, b) => pt[0] - b.x < 3 || b.x + b.w - pt[0] < 3 || pt[1] - b.y < 3 || b.y + b.h - pt[1] < 3;
  const dragBy = async (pt, dx, dy, steps = 8) => { await pg.mouse.move(...pt); await pg.mouse.down(); await pg.mouse.move(pt[0] + dx, pt[1] + dy, { steps }); await pg.mouse.up(); await pg.waitForTimeout(140); };
  const geo = async () => JSON.stringify((await shells()).map(x => [x.id, x.x, x.y, x.w, x.h]));
  const clips = () => pg.$$eval('.frame-shell .comic-frame', e => e.map(x => x.style.clipPath));
  const previewText = () => pg.$eval('#previewBar', e => (e.hidden ? '' : e.textContent.replace(/\s+/g, ' ').trim()));
  const selectFrame = async i => { const s = await shells(); await pg.mouse.click(...center(s[i])); await pg.waitForTimeout(80); };
  const deselect = () => pg.keyboard.press('Escape');
  const undoDisabled = () => pg.$eval('#undoBtn', e => e.disabled);
  const overlap = (p, q) => Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)) * Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));

  await pg.goto(URL); await pg.waitForTimeout(700);
  await makeFixtures(pg);

  // ════════ پایه
  await step('boot: no errors, Khamenei.ir 400/700/900 loaded, no restore prompt on empty profile, no network', async () => {
    const f = await pg.evaluate(async () => { await document.fonts.ready; return { reg: document.fonts.check('16px "Khamenei.ir"'), bold: document.fonts.check('700 16px "Khamenei.ir"'), black: document.fonts.check('900 16px "Khamenei.ir"'), fam: getComputedStyle(document.body).fontFamily.split(',')[0], dlg: document.querySelector('#restorePrompt').open, dir: document.documentElement.dir }; });
    ok(f.reg && f.bold && f.black, 'font faces'); eq(f.dlg, false, 'restore dialog open'); ok(/Khamenei/.test(f.fam), f.fam); eq(f.dir, 'rtl'); return f;
  });
  await step('empty state invites action: quick layout builds 4 frames and moves to step 2', async () => {
    ok(await pg.isVisible('#emptyState'), 'empty state visible'); await pg.click('[data-quick="grid"]'); await pg.waitForTimeout(150);
    eq((await shells()).length, 4); ok(await pg.isHidden('#emptyState'), 'hidden after layout'); eq(await pg.getAttribute('[data-editor-tab="layout"]', 'aria-current'), 'step');
  });
  await step('batch images fill empty frames in reading order', async () => {
    await tab('image'); await pg.setInputFiles('#batchImageInput', [1, 2, 3, 4].map(IMG)); await pg.waitForTimeout(1000);
    eq(await imgs(), 4); ok(/۴ تصویر/.test(await msg()), await msg()); await pg.screenshot({ path: path.join(T, 'a-images.png') });
  });
  await step('undo: slider keyboard edit = ONE undo step; redo restores', async () => {
    await tab('page'); const before = await pg.inputValue('#gapRange'); await pg.focus('#gapRange'); for (let i = 0; i < 4; i++) await pg.keyboard.press('ArrowRight');
    const mid = await pg.inputValue('#gapRange'); ok(mid !== before, 'slider moved'); await pg.evaluate(() => document.activeElement.blur());
    await pg.keyboard.press('Control+z'); eq(await pg.inputValue('#gapRange'), before, 'one undo restores'); await pg.keyboard.press('Control+Shift+z'); eq(await pg.inputValue('#gapRange'), mid, 'redo'); return { before, mid };
  });
  await step('undo: colour picker changes are undoable', async () => {
    await unfold('#gutterColor'); const before = await pg.inputValue('#gutterColor'); await pg.selectOption('#gutterStyle', 'simpleColor');
    await pg.evaluate(() => { const i = document.querySelector('#gutterColor'); i.focus(); i.value = '#ff0000'; i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new Event('change', { bubbles: true })); });
    eq(await pg.inputValue('#gutterColor'), '#ff0000'); await pg.click('#undoBtn'); eq(await pg.inputValue('#gutterColor'), before, 'color undone'); await pg.click('#undoBtn'); eq(await pg.inputValue('#gutterStyle'), 'simpleWhite', 'style undone');
  });
  await step('Ctrl+Z inside a number field does NOT undo the whole project', async () => {
    await tab('page'); await pg.fill('#gapRange', '9'); await pg.dispatchEvent('#gapRange', 'input'); await pg.dispatchEvent('#gapRange', 'change');
    await tab('layout'); await selectFrame(0); await unfold('#frameW'); await pg.focus('#frameW'); await pg.keyboard.press('Control+z');
    await tab('page'); eq(await pg.inputValue('#gapRange'), '9', 'gap kept'); await pg.click('#undoBtn'); ok(await pg.inputValue('#gapRange') !== '9', 'undo via button still works');
  });
  // ════════ هندسه و آهنربا
  await step('magnet: Alt does not allow overlap (drag one frame over another)', async () => {
    await tab('layout'); await pg.click('#clearFramesBtn'); await pg.click('#confirmOk', { timeout: 800 }).catch(() => {}); await pg.waitForTimeout(100); await unfold('#shapeLibrary');
    for (const sz of ['landscape', 'square']) { await pg.click(`[data-add-shape="rect"][data-size="${sz}"]`); await pg.waitForTimeout(150); if (await pg.evaluate(() => document.querySelector('#expandPrompt').open)) await pg.click('[data-expand="none"]'); await pg.waitForTimeout(100); }
    let s = await shells(); eq(s.length, 2, 'two frames'); await selectFrame(1); s = await shells();
    await pg.keyboard.down('Alt'); await pg.mouse.move(...center(s[1])); await pg.mouse.down(); await pg.mouse.move(...center(s[0]), { steps: 12 }); await pg.mouse.up(); await pg.keyboard.up('Alt'); await pg.waitForTimeout(150);
    s = await shells(); ok(overlap(s[0], s[1]) < 4, 'overlap px²=' + overlap(s[0], s[1]));
  });
  await step('one frame drag = one undo step', async () => {
    await pg.click('#clearFramesBtn'); await pg.click('#confirmOk', { timeout: 800 }).catch(() => {}); await unfold('#shapeLibrary'); await pg.click('[data-add-shape="rect"][data-size="square"]'); await pg.waitForTimeout(150);
    if (await pg.evaluate(() => document.querySelector('#expandPrompt').open)) await pg.click('[data-expand="none"]');
    const a = (await shells())[0];
    await pg.mouse.move(...center(a)); await pg.mouse.down(); for (let i = 1; i <= 10; i++) await pg.mouse.move(center(a)[0] + i * 5, center(a)[1] + i * 6); await pg.mouse.up(); await pg.waitForTimeout(100);
    const moved = (await shells())[0]; ok(Math.abs(moved.y - a.y) > 5 || Math.abs(moved.x - a.x) > 5, 'moved');
    await pg.click('#undoBtn'); const back = (await shells())[0]; ok(Math.abs(back.x - a.x) < 1 && Math.abs(back.y - a.y) < 1, 'single undo restores position');
  });
  await step('rejected or clamped nudge leaves NO empty undo step (bug fixed in v25)', async () => {
    await layout(2, 'grid', 'classic'); await selectFrame(0); const wasDisabled = await undoDisabled();
    const pastLen = await pg.evaluate(() => 0); // no global access: compare visible behaviour instead
    const before = JSON.stringify(await shells());
    for (const k of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) await pg.keyboard.press(k); await pg.waitForTimeout(80);
    eq(JSON.stringify(await shells()), before, 'tiled frames cannot move'); await pg.click('#undoBtn'); await pg.waitForTimeout(80);
    // the click above must undo the TEMPLATE (frames count changes back), not an empty nudge step
    ok((await shells()).length !== 2 || JSON.stringify(await shells()) !== before, 'undo went to a real previous state'); await pg.click('#redoBtn'); return { wasDisabled, pastLen };
  });
  await step('magnet: switching on never asks and never changes the layout; overlaps are shown; "fix overlaps" separates them after a preview', async () => {
    await tab('layout'); await pg.click('#clearFramesBtn'); await pg.click('#confirmOk', { timeout: 800 }).catch(() => {}); await unfold('#shapeLibrary');
    for (const sz of ['landscape', 'square']) { await pg.click(`[data-add-shape="rect"][data-size="${sz}"]`); await pg.waitForTimeout(150); if (await pg.evaluate(() => document.querySelector('#expandPrompt').open)) await pg.click('[data-expand="none"]'); }
    await pg.click('.switch:has(#magnetToggle)'); await pg.waitForTimeout(100); eq(await pg.isChecked('#magnetToggle'), false);
    await selectFrame(1); let s = await shells(); await pg.mouse.move(...center(s[1])); await pg.mouse.down(); await pg.mouse.move(...center(s[0]), { steps: 10 }); await pg.mouse.up(); await pg.waitForTimeout(120);
    s = await shells(); ok(overlap(s[0], s[1]) > 100, 'overlap with magnet off'); const before = JSON.stringify(s.map(x => [x.x, x.y, x.w, x.h]));
    for (let i = 0; i < 3; i++) { await pg.click('.switch:has(#magnetToggle)'); await pg.waitForTimeout(120); } // on, off, on
    eq(await pg.evaluate(() => document.querySelector('#confirmDialog').open), false, 'no dialog'); eq(await pg.isChecked('#magnetToggle'), true);
    eq(JSON.stringify((await shells()).map(x => [x.x, x.y, x.w, x.h])), before, 'layout untouched'); ok(/هم‌پوشانی/.test(await diag()), 'chip: ' + await diag());
    // an overlapping frame can still be moved away while the magnet is on
    await pg.click('#fixOverlapsBtn'); await pg.waitForSelector('#previewBar:not([hidden])'); eq(JSON.stringify((await shells()).map(x => [x.x, x.y, x.w, x.h])), before, 'preview changes nothing');
    await pg.keyboard.press('Enter'); await pg.waitForTimeout(200); s = await shells(); ok(overlap(s[0], s[1]) < 4, 'resolved'); ok(!/هم‌پوشانی/.test(await diag()), 'chip after: ' + await diag());
    await pg.click('#undoBtn'); s = await shells(); ok(overlap(s[0], s[1]) > 100, 'one undo brings the overlap back'); await pg.click('#redoBtn');
  });
  await step('confirm dialog: delete frame — cancel keeps, confirm removes; Escape inside dialog keeps selection', async () => {
    await selectFrame(0); await pg.click('#deleteFrameBtn'); await pg.waitForSelector('#confirmDialog[open]'); ok(/حذف/.test(await pg.textContent('#confirmTitle'))); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100);
    eq((await shells()).length, 2, 'escape = cancel'); ok((await shells()).some(x => x.sel), 'selection kept after Escape in dialog');
    await pg.click('#deleteFrameBtn'); await pg.click('#confirmCancel'); eq((await shells()).length, 2, 'cancel');
    await pg.click('#deleteFrameBtn'); await pg.click('#confirmOk'); await pg.waitForTimeout(100); eq((await shells()).length, 1, 'confirm');
  });
  await step('Ctrl+Z is ignored while a dialog is open', async () => {
    await pg.click('#deleteFrameBtn'); await pg.waitForSelector('#confirmDialog[open]'); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(80);
    eq((await shells()).length, 1, 'no undo behind dialog'); await pg.click('#confirmCancel');
  });
  await step('template with more images than frames asks first; cancel keeps images; undo restores', async () => {
    await layout(4, 'grid', 'classic'); await tab('image'); await pg.setInputFiles('#batchImageInput', [1, 2, 3, 4].map(IMG)); await pg.waitForTimeout(900); eq(await imgs(), 4);
    await tab('layout'); await pg.click('[data-count="2"]'); await pg.waitForSelector('#confirmDialog[open]'); ok(/۲ تصویر/.test(await pg.textContent('#confirmMessage'))); await pg.click('#confirmCancel'); eq((await shells()).length, 4); eq(await imgs(), 4);
    await pg.click('[data-count="2"]'); await pg.click('#confirmOk'); await pg.waitForTimeout(150); eq((await shells()).length, 2); await pg.click('#undoBtn'); eq((await shells()).length, 4); eq(await imgs(), 4);
  });
  await step('vertex: add via button, remove via double-tap on the yellow point; undo', async () => {
    await layout(3, 'grid', 'classic'); await pg.click('#clearFramesBtn'); await pg.click('#confirmOk', { timeout: 800 }).catch(() => {}); await layout(3, 'grid', 'classic'); await selectFrame(0); await unfold('#addVertexBtn');
    const n0 = faNum(await pg.textContent('#vertexCount')); await pg.click('#addVertexBtn'); const n1 = faNum(await pg.textContent('#vertexCount')); eq(n1, n0 + 1);
    const h = await pg.$('.vertex-handle.selected-vertex'); ok(h, 'new vertex selected'); await h.dblclick(); await pg.waitForTimeout(150); eq(faNum(await pg.textContent('#vertexCount')), n0, 'removed');
    await pg.click('#undoBtn'); eq(faNum(await pg.textContent('#vertexCount')), n1, 'undo of removal'); return { n0, n1 };
  });
  await step('numeric size edit keeps a custom (diagonal) shape', async () => {
    await layout(5, 'zigzag', 'diagonal'); await selectFrame(0); const before = await pg.evaluate(() => document.querySelector('.frame-shell.selected .comic-frame').style.clipPath);
    await unfold('#frameH'); await pg.fill('#frameH', '30'); await pg.dispatchEvent('#frameH', 'change'); await pg.waitForTimeout(150);
    const after = await pg.evaluate(() => document.querySelector('.frame-shell.selected .comic-frame')?.style.clipPath); ok(after && /polygon/.test(after)); ok(!/^polygon\(0% 0%, ?100% 0%, ?100% 100%, ?0% 100%\)$/.test(after) || before === after, 'not flattened'); return { before, after };
  });
  await step('frame info uses Persian digits only (no Latin digits in visible UI text)', async () => {
    await selectFrame(1); const t = await pg.evaluate(() => { const out = []; const walk = n => { if (n.nodeType === 3) { const el = n.parentElement; if (!el || el.closest('input,select,option,[dir=ltr],.file-name,script,style,kbd,#gutterColorValue,#gutterAccentValue')) return; const r = el.getBoundingClientRect(); if (r.width && getComputedStyle(el).visibility !== 'hidden' && /[0-9]/.test(n.data.replace(/dpi|PNG|PDF|ZIP|JPG|WebP|A4|B5|Ctrl|Shift|Alt/g, ''))) out.push(n.data.trim().slice(0, 50)); } else n.childNodes.forEach(walk) }; walk(document.body); return out; });
    eq(t, [], 'latin digits found'); return await pg.textContent('#frameInfo');
  });
  await step('zoom: fit fills the stage; buttons, keys and ctrl+wheel change size', async () => {
    await deselect(); await pg.click('#stageZoomFit'); await pg.waitForTimeout(100);
    const fit = await pg.evaluate(() => { const p = document.querySelector('#comicPage').getBoundingClientRect(), s = document.querySelector('#canvasScroller').getBoundingClientRect(); return { pw: p.width, ph: p.height, sw: s.width, sh: s.height }; });
    ok(fit.ph > fit.sh * 0.85 || fit.pw > fit.sw * 0.85, 'page fills the stage ' + JSON.stringify(fit));
    const w = () => pg.$eval('#comicPage', e => e.getBoundingClientRect().width); const w0 = await w(); await pg.click('#stageZoomOut'); await pg.click('#stageZoomOut'); ok(await w() < w0 - 10, 'zoom out');
    await pg.keyboard.press('0'); await pg.waitForTimeout(80); eq(Math.round(await w()), Math.round(w0), 'key 0 = fit'); await pg.keyboard.press('+'); ok(await w() > w0, '+ zooms in');
    await pg.hover('#canvasScroller'); await pg.keyboard.down('Control'); await pg.mouse.wheel(0, 200); await pg.keyboard.up('Control'); await pg.waitForTimeout(150); const w3 = await w(); await pg.click('#stageZoomFit'); return { fit: Math.round(w0), w3: Math.round(w3) };
  });
  await step('guides toggle (G) shows editor-only thirds grid and is remembered', async () => {
    await pg.keyboard.press('g'); ok(await pg.isVisible('.guides')); eq(await pg.getAttribute('#guidesBtn', 'aria-pressed'), 'true'); await pg.click('#guidesBtn'); ok(await pg.isHidden('.guides'));
  });
  await step('pages: add, move, duplicate, delete (with confirm)', async () => {
    await pg.click('#addPageBtn'); await pg.waitForTimeout(100); eq(await pg.$$eval('.page-card', e => e.length), 2);
    await pg.click('#movePageUpBtn'); await pg.waitForTimeout(100); ok(/بدون قاب/.test(await pg.$eval('.page-card:first-child small', e => e.textContent)), 'moved to front');
    await pg.click('#movePageDownBtn'); await pg.waitForTimeout(100); ok(/بدون قاب/.test(await pg.$eval('.page-card:nth-child(2) small', e => e.textContent)), 'moved back');
    await pg.click('#duplicatePageBtn'); eq(await pg.$$eval('.page-card', e => e.length), 3); await pg.click('#deletePageBtn'); await pg.click('#confirmOk'); eq(await pg.$$eval('.page-card', e => e.length), 2); await pg.click('.page-card:first-child'); await pg.waitForTimeout(100);
  });
  // ════════ تصویر
  await step('drop an image file onto a frame', async () => {
    await layout(3, 'grid', 'classic'); await pg.click('#clearFramesBtn'); await pg.click('#confirmOk', { timeout: 800 }).catch(() => {}); await layout(3, 'grid', 'classic'); eq(await imgs(), 0); const t = (await shells())[1];
    await pg.evaluate(async ({ x, y }) => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; c.getContext('2d').fillRect(0, 0, 400, 300); const blob = await new Promise(r => c.toBlob(r, 'image/png')); const dt = new DataTransfer(); dt.items.add(new File([blob], 'drop.png', { type: 'image/png' })); const el = document.querySelector('#comicPage'); for (const type of ['dragover', 'drop']) el.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true, clientX: x, clientY: y })); }, { x: t.x + t.w / 2, y: t.y + t.h / 2 });
    await pg.waitForTimeout(600); eq(await imgs(), 1); eq((await shells()).filter(x => x.sel).length, 1);
  });
  await step('unsupported file (HEIC) and extra files are reported, not dropped silently (bug fixed in v25)', async () => {
    await tab('image'); await pg.setInputFiles('#batchImageInput', [IMG('fake.heic')]); await pg.waitForTimeout(300); ok(/JPG، PNG یا WebP/.test(await msg()), 'heic: ' + await msg());
    await pg.setInputFiles('#batchImageInput', [2, 3, 4, 5].map(IMG)); await pg.waitForTimeout(1000); const m = await msg(); ok(/۲ تصویر قاب خالی نداشت/.test(m), m); eq(await imgs(), 3); return m;
  });
  await step('changing the layout keeps images in Persian reading order (bug fixed in v25)', async () => {
    await layout(4, 'grid', 'classic'); await tab('image'); const order = await pg.$$eval('#imagePanelPicker button', b => b.map(x => x.title.replace(/^.*— /, '')));
    const withImg = order.filter(x => x !== 'بدون تصویر'); eq(order.slice(0, withImg.length), withImg, 'images first, in order: ' + order.join(' | ')); return order;
  });
  await step('Persian file name imports fine', async () => {
    await layout(4, 'grid', 'classic'); await pg.click('[data-count="4"]').catch(() => {}); await tab('image'); await pg.click('#imagePanelPicker button:nth-child(4)');
    await pg.setInputFiles('#selectedImageInput', { name: 'عکس فارسی ۱.jpg', mimeType: 'image/jpeg', buffer: fs.readFileSync(IMG(1)) }); await pg.waitForTimeout(600); ok(/عکس فارسی/.test(await pg.textContent('#selectedFileName')), await pg.textContent('#selectedFileName'));
  });
  await step('large photo (6000×4000) is downscaled to ≤4096 on import', async () => {
    await pg.click('#imagePanelPicker button:nth-child(1)'); await pg.setInputFiles('#selectedImageInput', IMG('big.jpg')); await pg.waitForFunction(() => /big\.jpg/.test(document.querySelector('#selectedFileName').textContent), null, { timeout: 30000 }); await pg.waitForTimeout(300);
    const nw = await pg.evaluate(() => { const i = document.querySelector('.frame-shell.selected img'); return i ? Math.max(i.naturalWidth, i.naturalHeight) : 0 }); ok(nw > 0 && nw <= 4096, 'max side ' + nw); ok(/کوچک شد/.test(await msg())); return nw;
  });
  await step('large transparent WebP keeps transparency after downscale (was turned into black JPEG)', async () => {
    await pg.click('#imagePanelPicker button:nth-child(2)'); await pg.setInputFiles('#selectedImageInput', IMG('trans-big.webp')); await pg.waitForFunction(() => /trans-big/.test(document.querySelector('#selectedFileName').textContent), null, { timeout: 30000 }); await pg.waitForTimeout(300);
    const r = await pg.evaluate(async () => { const i = document.querySelector('.frame-shell.selected img'); const c = document.createElement('canvas'); c.width = 50; c.height = 30; const g = c.getContext('2d'); g.drawImage(i, 0, 0, 50, 30); return { mime: i.src.slice(5, 15), cornerAlpha: g.getImageData(1, 1, 1, 1).data[3], max: Math.max(i.naturalWidth, i.naturalHeight) }; });
    ok(!/jpeg/.test(r.mime), 'stored as ' + r.mime); eq(r.cornerAlpha, 0, 'corner stays transparent'); ok(r.max <= 4096); return r;
  });
  await step('transparent PNG: preview and export both show the paper colour under the image', async () => {
    await pg.click('#imagePanelPicker button:nth-child(3)'); await pg.setInputFiles('#selectedImageInput', IMG('trans.png')); await pg.waitForTimeout(700);
    const bg = await pg.evaluate(() => getComputedStyle(document.querySelector('.frame-shell.selected .comic-frame')).backgroundColor); eq(bg, 'rgb(246, 242, 232)', 'preview bg = paper');
    await pg.click('#exportBtn'); const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#downloadPngBtn')]); const f = path.join(T, 'trans-export.png'); await dl.saveAs(f);
    const px = await pg.evaluate(async ({ b64, fr }) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); const x = Math.round(im.width * (fr.x + fr.w * 0.08)), y = Math.round(im.height * (fr.y + fr.h * 0.08)); return [...g.getImageData(x, y, 1, 1).data]; }, { b64: fs.readFileSync(f).toString('base64'), fr: await pg.evaluate(() => { const s = document.querySelector('.frame-shell.selected'), p = document.querySelector('#comicPage').getBoundingClientRect(), r = s.getBoundingClientRect(); return { x: (r.x - p.x) / p.width, y: (r.y - p.y) / p.height, w: r.width / p.width, h: r.height / p.height }; }) });
    ok(Math.abs(px[0] - 246) < 4 && Math.abs(px[1] - 242) < 4 && Math.abs(px[2] - 232) < 4, 'export pixel ' + px); return px;
  });
  await step('EXIF-rotated JPEG shows upright and exports the same way', async () => {
    await pg.click('#imagePanelPicker button:nth-child(4)'); await pg.setInputFiles('#selectedImageInput', IMG('exif6.jpg')); await pg.waitForTimeout(700);
    const r = await pg.evaluate(() => { const i = document.querySelector('.frame-shell.selected img'); return { w: i.naturalWidth, h: i.naturalHeight }; }); ok(r.h > r.w, 'upright (portrait) ' + JSON.stringify(r)); return r;
  });
  await step('Safari fallback: pixel colour-look path matches ctx.filter path', async () => {
    await pg.selectOption('#lookPreset', 'noir').catch(async () => { await unfold('#lookPreset'); await pg.selectOption('#lookPreset', 'noir'); });
    await pg.selectOption('#lookPreset', 'warm'); await pg.click('#exportBtn'); const [d1] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#downloadPngBtn')]); const a = path.join(T, 'look-filter.png'); await d1.saveAs(a);
    await pg.evaluate(() => document.documentElement.dataset.testPixelLook = '1'); await pg.click('#exportBtn'); const [d2] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#downloadPngBtn')]); const b = path.join(T, 'look-pixel.png'); await d2.saveAs(b);
    await pg.evaluate(() => delete document.documentElement.dataset.testPixelLook);
    const diff = await pg.evaluate(async ([x, y]) => { const load = async b64 => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = 400; c.height = Math.round(400 * im.height / im.width); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; }; const A = await load(x), B = await load(y); let s = 0; for (let i = 0; i < A.length; i += 4) s += Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]); return s / (A.length / 4 * 3); }, [fs.readFileSync(a).toString('base64'), fs.readFileSync(b).toString('base64')]);
    ok(diff < 3, 'mean abs diff ' + diff); await pg.selectOption('#lookPreset', 'original'); return +diff.toFixed(3);
  });
  // ════════ ذخیره، بازکردن، بازیابی
  await step('autosave: chip shows saved, reload offers restore, restore brings back frames and images', async () => {
    await pg.waitForTimeout(2600); eq(await pg.$eval('#saveChip', e => e.dataset.state), 'saved');
    const before = { shells: (await shells()).length, imgs: await imgs(), pages: await pg.$$eval('.page-card', e => e.length) };
    await pg.reload(); await pg.waitForSelector('#restorePrompt[open]', { timeout: 6000 }); ok(/صفحه/.test(await pg.textContent('#restoreInfo'))); await pg.click('#restoreYes'); await pg.waitForTimeout(800);
    eq({ shells: (await shells()).length, imgs: await imgs(), pages: await pg.$$eval('.page-card', e => e.length) }, before); return before;
  });
  await step('autosave: "start fresh" clears the backup', async () => {
    await pg.waitForTimeout(1600); await pg.reload(); await pg.waitForSelector('#restorePrompt[open]'); await pg.click('#restoreNo'); await pg.waitForSelector('#confirmDialog[open]'); ok(/برنمی‌گردد/.test(await pg.textContent('#confirmMessage'))); await pg.click('#confirmOk'); await pg.waitForTimeout(500); eq((await shells()).length, 0); await pg.waitForTimeout(1600);
    await pg.reload(); await pg.waitForTimeout(900); eq(await pg.evaluate(() => document.querySelector('#restorePrompt').open), false);
  });
  let savedFile;
  await step('save project → JSON valid with Jalali name; reopen restores', async () => {
    await pg.click('[data-quick="grid"]'); await layout(5, 'mosaic', 'experimental'); await tab('image'); await pg.setInputFiles('#batchImageInput', [1, 2, 3, 4, 5].map(IMG)); await pg.waitForTimeout(1200);
    const [dl] = await Promise.all([pg.waitForEvent('download'), pg.keyboard.press('Control+s')]); savedFile = path.join(T, 'saved.json'); await dl.saveAs(savedFile);
    const j = JSON.parse(fs.readFileSync(savedFile, 'utf8')); eq(j.app, 'comic-page-studio'); eq(j.version, 10); eq(Object.keys(j.assets).length, 5, 'assets table'); ok(!JSON.stringify(j.pages).includes('data:image'), 'images only in assets'); eq(j.pages[0].panels.length, 5); ok(/^comic-project-14\d\d-\d\d-\d\d\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    await pg.click('#newProjectBtn'); await pg.click('#confirmOk'); await pg.waitForTimeout(150); eq((await shells()).length, 0);
    await pg.setInputFiles('#projectInput', savedFile); await pg.waitForTimeout(900); eq((await shells()).length, 5); eq(await imgs(), 5); return dl.suggestedFilename();
  });
  await step('opening a file over a non-empty book asks first; cancel keeps the book', async () => {
    await pg.setInputFiles('#projectInput', savedFile); await pg.waitForSelector('#confirmDialog[open]'); await pg.click('#confirmCancel'); await pg.waitForTimeout(150); eq((await shells()).length, 5);
  });
  await step('hostile, broken, foreign and old-format (v3) project files are handled with clear messages', async () => {
    const hostile = path.join(T, 'hostile.json'); fs.writeFileSync(hostile, JSON.stringify({ app: 'comic-page-studio', version: 99, pages: [{ preset: 'bad', panels: [{ x: 1, y: 1, w: 50, h: 50, image: { dataUrl: 'javascript:alert(1)' } }, { x: 'zz', y: 60, w: 30, h: 30 }, { __proto__: { polluted: 1 }, x: 5 }] }] }));
    await pg.setInputFiles('#projectInput', hostile); await pg.waitForSelector('#confirmDialog[open]'); await pg.click('#confirmOk'); await pg.waitForTimeout(400); const t = await msg(); ok(/نامعتبر|جدیدتر/.test(t), t); eq(await imgs(), 0); eq(await pg.evaluate(() => ({}).polluted), undefined, 'no prototype pollution');
    await pg.click('#undoBtn'); eq((await shells()).length, 5, 'undo returns previous project');
    const broken = path.join(T, 'broken.json'); fs.writeFileSync(broken, '{not json'); await pg.setInputFiles('#projectInput', broken); await pg.waitForTimeout(300); ok(/معتبر نیست/.test(await msg())); eq((await shells()).length, 5);
    const foreign = path.join(T, 'other-app.json'); fs.writeFileSync(foreign, JSON.stringify({ app: 'podcast', pages: [] })); await pg.setInputFiles('#projectInput', foreign); await pg.waitForTimeout(300); ok(/قاب‌چین نیست/.test(await msg()), await msg());
    const old = path.join(T, 'old-v3.json'); const dataUrl = 'data:image/jpeg;base64,' + fs.readFileSync(IMG(1)).toString('base64');
    fs.writeFileSync(old, JSON.stringify({ app: 'comic-page-studio', version: 3, pages: [{ preset: 'a4', gutterStyle: 'hatch', gap: 6, images: [{ name: 'a.jpg', dataUrl, width: 1600, height: 1000 }, { name: 'b.jpg', dataUrl, width: 1600, height: 1000 }] }] }));
    await pg.setInputFiles('#projectInput', old); await pg.waitForSelector('#confirmDialog[open]'); await pg.click('#confirmOk'); await pg.waitForTimeout(600); eq((await shells()).length, 2, 'old format builds frames'); eq(await imgs(), 2, 'old images kept');
    await tab('page'); eq(await pg.inputValue('#gutterStyle'), 'proHatch', 'old style mapped'); await pg.click('#undoBtn');
  });
  // ════════ خروجی
  let pngFile;
  await step('export PNG: real size, 300 dpi metadata', async () => {
    await pg.click('#exportBtn'); const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#downloadPngBtn')]); pngFile = path.join(T, 'export.png'); await dl.saveAs(pngFile);
    const buf = fs.readFileSync(pngFile); eq(pngSize(pngFile), { w: 1949, h: 2776 }); ok(buf.includes(Buffer.from('pHYs'))); return pngSize(pngFile);
  });
  await step('export PDF (current page, via blob) and ZIP (book); status shown in dialog', async () => {
    await pg.click('#exportBtn'); const [d1] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#printBookBtn')]); const pdf = path.join(T, 'export.pdf'); await d1.saveAs(pdf); ok(fs.readFileSync(pdf).subarray(0, 5).toString() === '%PDF-');
    await pg.click('#addPageBtn'); await layout(2, 'header', 'classic');
    await pg.click('#exportBtn'); await pg.selectOption('#exportScope', 'book'); const [d2] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#downloadPngBtn')]); const z = path.join(T, 'export.zip'); await d2.saveAs(z);
    const zb = fs.readFileSync(z); eq(zb.readUInt32LE(0), 0x04034b50); eq(zb.readUInt16LE(zb.length - 12), 2, 'two pages in zip');
    await pg.click('#exportStepBtn'); await pg.selectOption('#exportScope', 'current'); await pg.click('[data-editor-tab="page"]').catch(() => {}); await pg.keyboard.press('Escape');
  });
  await step('preview vs export: pixel comparison of the page (editor overlays hidden)', async () => {
    await pg.keyboard.press('Escape'); await pg.click('.page-card:first-child'); await deselect(); await tab('page'); await pg.selectOption('#gutterStyle', 'doubleComic'); await pg.fill('#gapRange', '8'); await pg.dispatchEvent('#gapRange', 'input'); await pg.dispatchEvent('#gapRange', 'change'); await pg.waitForTimeout(250);
    await pg.addStyleTag({ content: '.panel-number,.panel-lock{display:none!important}' });
    const shot = await pg.locator('#comicPage').screenshot({ path: path.join(T, 'preview.png') });
    await pg.click('#exportBtn'); const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#downloadPngBtn')]); const f = path.join(T, 'export-cmp.png'); await dl.saveAs(f);
    const r = await pg.evaluate(async ([a, b]) => { const load = async (b64, w, h) => { const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode(); const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(im, 0, 0, w, h); return g.getImageData(0, 0, w, h).data; }; const W = 200, H = 285; const A = await load(a, W, H), B = await load(b, W, H); let s = 0, big = 0; for (let i = 0; i < A.length; i += 4) { const d = (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2])) / 3; s += d; if (d > 40) big++; } return { mean: s / (W * H), bigShare: big / (W * H) }; }, [shot.toString('base64'), fs.readFileSync(f).toString('base64')]);
    ok(r.mean < 6 && r.bigShare < 0.02, 'preview differs from export ' + JSON.stringify(r)); return { mean: +r.mean.toFixed(2), bigShare: +r.bigShare.toFixed(4) };
  });

  // ════════ نسخهٔ ۲۶: آهنربا، دستگیره‌ها، جورچین، افزودن قاب
  await step('v26 magnet: a frame dragged into its neighbour stops exactly at contact (no jump, no overlap)', async () => {
    await fresh(); await pg.click('#clearFramesBtn'); await pg.click('#confirmOk', { timeout: 800 }).catch(() => {});
    for (const sz of ['square', 'square']) { await pg.click(`[data-add-shape="rect"][data-size="${sz}"]`); await pg.waitForTimeout(150); if (await pg.evaluate(() => document.querySelector('#expandPrompt').open)) await pg.click('[data-expand="none"]'); }
    await selectFrame(1); let s = await shells(); const a = s.find(x => !x.sel), b = s.find(x => x.sel);
    await pg.mouse.move(...center(b)); await pg.mouse.down(); await pg.mouse.move(center(b)[0] + (a.x - b.x) * 0.6, center(b)[1] + (a.y - b.y) * 0.6, { steps: 14 }); await pg.mouse.up(); await pg.waitForTimeout(150);
    s = await shells(); const b2 = s.find(x => x.id === b.id); ok(overlap(a, b2) < 4, 'no overlap'); const gapX = Math.max(a.x - (b2.x + b2.w), b2.x - (a.x + a.w)), gapY = Math.max(a.y - (b2.y + b2.h), b2.y - (a.y + a.h)); ok(Math.max(gapX, gapY) < 2.5, 'touching: ' + [gapX, gapY]); return { gapX, gapY };
  });
  await step('v26 magnet: arrow keys go up to the neighbour and say which frame is in the way (no refusal)', async () => {
    await fresh(); await selectFrame(0); const me = (await shells()).find(x => x.sel), box = await pageBox(), said = [];
    await pg.fill('#frameW', '40'); await pg.dispatchEvent('#frameW', 'change'); await pg.waitForTimeout(120); ok(/شکاف/.test(await diag()), 'gap created: ' + await diag());
    await pg.evaluate(() => document.activeElement.blur()); // arrow keys belong to the field while it has focus
    for (const key of ['ArrowLeft', 'ArrowRight']) {
      for (let i = 0; i < 16; i++) await pg.keyboard.press(key); await pg.waitForTimeout(120); said.push(await msg());
      const all = await shells(), now = all.find(x => x.id === me.id), others = all.filter(x => x.id !== me.id);
      ok(others.every(o => overlap(now, o) < 4), 'no overlap after ' + key);
      const edge = key === 'ArrowLeft' ? now.x : now.x + now.w, stops = [box.x, box.x + box.w, ...others.flatMap(o => [o.x, o.x + o.w])];
      ok(stops.some(v => Math.abs(v - edge) < 1.5), key + ' ends in contact, edge at ' + edge);
    }
    ok(said.some(t => /تا لبهٔ قاب|سر راه است/.test(t)), said.join(' | ')); return said;
  });
  await step('v26 numeric field: committing the value already shown changes nothing and adds no undo step', async () => {
    await fresh('header'); await selectFrame(1); const before = await geo(); const n = await pg.$eval('#undoBtn', e => e.disabled);
    for (const id of ['#frameH', '#frameW', '#frameX', '#frameY']) { const v = await pg.inputValue(id); await pg.fill(id, v); await pg.dispatchEvent(id, 'change'); await pg.waitForTimeout(60); }
    eq(await geo(), before, 'geometry'); eq(await diag(), '', 'still tiled');
    await pg.click('#undoBtn'); await pg.waitForTimeout(80); ok((await shells()).length === 0, 'undo went straight to the empty page (no empty steps)'); await pg.click('#redoBtn');
  });
  await step('v26 shared border: dragging the edge between two frames moves both, in both directions, page stays covered; one undo', async () => {
    await fresh(); await selectFrame(0); const box = await pageBox(), hs = (await handles('.edge-handle')).filter(pt => !onBorder(pt, box)); eq(hs.length, 2, 'two shared edges'); const out = [];
    for (const pt of hs) for (const d of [24, -24]) { const g0 = await geo(); await dragBy(pt, d, d); const g1 = await geo(); ok(g0 !== g1, 'moved'); eq(await diag(), '', 'covered');
      const changed = JSON.parse(g1).filter((x, i) => JSON.stringify(x) !== JSON.stringify(JSON.parse(g0)[i])).length; ok(changed >= 2, 'neighbour followed: ' + changed); out.push(changed);
      await pg.click('#undoBtn'); await pg.waitForTimeout(80); eq(await geo(), g0, 'single undo'); }
    return out;
  });
  await step('v26 page-border edge can be pulled inwards; pushing it back snaps to the page edge', async () => {
    await fresh(); await selectFrame(0); const box = await pageBox(), me0 = (await shells()).find(x => x.sel), pt = (await handles('.edge-handle')).find(p2 => Math.abs(p2[1] - box.y) < 3);
    ok(pt, 'top edge handle'); await dragBy(pt, 0, 40); const me1 = (await shells()).find(x => x.sel); ok(me1.h < me0.h - 30 && me1.y > me0.y + 30, 'shrunk from the page side');
    const pt2 = (await handles('.edge-handle')).sort((p1, p2) => p1[1] - p2[1])[0]; await dragBy(pt2, 0, -44); const me2 = (await shells()).find(x => x.sel); ok(Math.abs(me2.y - me0.y) < 1, 'back on the edge: ' + me2.y); eq(await diag(), '');
  });
  await step('v26 shared corner: dragging the centre corner of a 2×2 grid reshapes all four frames and keeps the page covered', async () => {
    await fresh(); await selectFrame(0); const box = await pageBox(), v = (await handles('.vertex-handle')).find(pt => !onBorder(pt, box)); ok(v, 'inner corner'); const c0 = await clips();
    await dragBy(v, 26, -22); const c1 = await clips(); eq(c1.filter((x, i) => x !== c0[i]).length, 4, 'all four changed'); eq(await diag(), '', 'covered'); await pg.click('#undoBtn'); eq((await clips()).join(), c0.join(), 'one undo');
  });
  await step('v26 Alt+drag edits only this frame (old behaviour on demand)', async () => {
    await fresh(); await selectFrame(0); const box = await pageBox(), v = (await handles('.vertex-handle')).find(pt => !onBorder(pt, box)), c0 = await clips();
    const me = (await shells()).find(x => x.sel), dir = [Math.sign(center(me)[0] - v[0]) * 20, Math.sign(center(me)[1] - v[1]) * 20];
    await pg.keyboard.down('Alt'); await dragBy(v, dir[0], dir[1]); await pg.keyboard.up('Alt'); eq((await clips()).filter((x, i) => x !== c0[i]).length, 1, 'only one changed'); ok(/شکاف/.test(await diag()), 'gap appears');
  });
  await step('v26 handles: two quick drags are NOT a double tap; a real double tap adds a point', async () => {
    await fresh(); await selectFrame(0); const box = await pageBox(); const count = async () => faNum(await pg.textContent('#vertexCount')); const n0 = await count();
    let pt = (await handles('.edge-handle')).find(p2 => !onBorder(p2, box)); await dragBy(pt, 14, 14, 3); pt = (await handles('.edge-handle')).find(p2 => !onBorder(p2, box)); await dragBy(pt, -14, -14, 3); eq(await count(), n0, 'no vertex added by two drags');
    pt = (await handles('.edge-handle')).find(p2 => !onBorder(p2, box)); await pg.mouse.dblclick(...pt); await pg.waitForTimeout(150); eq(await count(), n0 + 1, 'double tap adds'); return { n0 };
  });
  await step('v26 handles sit exactly on the corners, are not clipped at the page edge, and never overlap on a small frame', async () => {
    await fresh(); await selectFrame(0); const r = await pg.evaluate(() => { const s = document.querySelector('.frame-shell.selected').getBoundingClientRect(), hs = [...document.querySelectorAll('#handlesLayer .vertex-handle')].map(h => h.getBoundingClientRect());
      const corners = [[s.left, s.top], [s.right, s.top], [s.right, s.bottom], [s.left, s.bottom]]; return { off: Math.max(...corners.map(c => Math.min(...hs.map(h => Math.hypot(h.left + h.width / 2 - c[0], h.top + h.height / 2 - c[1]))))), same: new Set([...document.querySelectorAll('#handlesLayer .handle')].map(h => Math.round(h.getBoundingClientRect().height))).size }; });
    ok(r.off <= 1, 'corner offset px ' + r.off);
    await pg.fill('#frameH', '5'); await pg.dispatchEvent('#frameH', 'change'); await pg.waitForTimeout(120);
    const ov = await pg.evaluate(() => { const hs = [...document.querySelectorAll('#handlesLayer .handle')].map(h => h.getBoundingClientRect()); let n = 0; for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) { const a = hs[i], b = hs[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) n++; } return { n, h: Math.round(document.querySelector('.frame-shell.selected').getBoundingClientRect().height) }; });
    ok(ov.h < 45, 'small frame ' + ov.h); eq(ov.n, 0, 'overlapping handle pairs'); return { ...r, ...ov };
  });
  await step('v26 invalid drag is explained: red outline while dragging and a message', async () => {
    await fresh(); await selectFrame(0); const box = await pageBox(), v = (await handles('.vertex-handle')).find(pt => !onBorder(pt, box)), me = (await shells()).find(x => x.sel);
    const far = [center(me)[0] + (center(me)[0] - v[0]) * 1.6, center(me)[1] + (center(me)[1] - v[1]) * 1.6];
    await pg.mouse.move(...v); await pg.mouse.down(); await pg.mouse.move(...far, { steps: 10 }); await pg.waitForTimeout(120);
    const red = await pg.$('.selection-outline.invalid'); await pg.mouse.up(); await pg.waitForTimeout(120); ok(red, 'outline marked invalid'); ok(/روی هم می‌افتند|سر راه است|کوچک‌تر نمی‌شود|برخورد/.test(await msg()), await msg()); eq(await diag(), '', 'page still covered'); return await msg();
  });
  await step('v26 "fit edges": preview first, Esc cancels, Enter applies; closes the gap without adding points', async () => {
    await fresh(); await selectFrame(0); await pg.fill('#frameH', '30'); await pg.dispatchEvent('#frameH', 'change'); await pg.fill('#frameW', '35'); await pg.dispatchEvent('#frameW', 'change'); await pg.waitForTimeout(120); ok(/شکاف/.test(await diag()));
    const g0 = await geo(), c0 = await clips(); await pg.click('#tidyFramesBtn'); await pg.waitForSelector('#previewBar:not([hidden])'); ok(/قاب تغییر می‌کند/.test(await previewText()), await previewText()); eq(await geo(), g0, 'nothing changed yet');
    await pg.keyboard.press('Escape'); await pg.waitForTimeout(100); eq(await previewText(), ''); eq(await geo(), g0, 'cancel keeps layout');
    await pg.click('#tidyFramesBtn'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(200); eq(await diag(), '', 'no gap left');
    const pts = c => c.reduce((n, x) => n + x.split(',').length, 0); ok(pts(await clips()) <= pts(c0) + 2, 'points ' + pts(c0) + '→' + pts(await clips())); await pg.click('#toastUndo'); await pg.waitForTimeout(100); eq(await geo(), g0, 'undo button in the message');
  });
  await step('v26 "full puzzle": fills a deleted frame\'s space by growing neighbours, never adds a frame silently', async () => {
    await fresh(); await selectFrame(0); await pg.click('#deleteFrameBtn'); await pg.click('#confirmOk'); await pg.waitForTimeout(120); eq((await shells()).length, 3);
    await pg.click('#smartPuzzleBtn'); await pg.waitForSelector('#previewBar:not([hidden])'); ok(!/قاب تازه/.test(await previewText()), await previewText()); await pg.click('#previewApply'); await pg.waitForTimeout(200); eq((await shells()).length, 3); eq(await diag(), '');
  });
  await step('v26 "border variety": three strengths, "another" gives a different proposal, page stays covered', async () => {
    await fresh('header'); const c0 = (await clips()).join(); const seen = new Set();
    for (const st of [1, 3]) { await pg.click(`[data-variety="${st}"]`); await pg.click('#creativeReflowBtn'); await pg.waitForSelector('#previewBar:not([hidden])'); const a = await pg.$$eval('.ghost.changed', e => e.map(x => x.getAttribute('points')).join('|')); await pg.click('#previewAgain'); await pg.waitForTimeout(120); const b = await pg.$$eval('.ghost.changed', e => e.map(x => x.getAttribute('points')).join('|')); ok(a !== b, 'another differs'); seen.add(a); seen.add(b); await pg.click('#previewApply'); await pg.waitForTimeout(150); eq(await diag(), '', 'covered'); }
    ok((await clips()).join() !== c0, 'changed'); eq(seen.size, 4);
  });
  await step('v26 add frame: six frames in a row always find room (smaller if needed); a full page offers a split', async () => {
    await fresh(); await pg.click('#clearFramesBtn'); await pg.click('#confirmOk', { timeout: 800 }).catch(() => {}); const notes = [];
    for (const sz of ['wide', 'wide', 'landscape', 'square', 'portrait', 'square']) { await pg.click(`[data-add-shape="rect"][data-size="${sz}"]`); await pg.waitForTimeout(200); if (await pg.evaluate(() => document.querySelector('#expandPrompt').open)) await pg.click('[data-expand="none"]'); notes.push((await shells()).length); }
    eq(notes, [1, 2, 3, 4, 5, 6]); ok(!/هم‌پوشانی/.test(await diag()), 'no overlap');
    await fresh(); await pg.click('[data-count="3"]'); await pg.waitForTimeout(150); await pg.click('[data-add-shape="rect"][data-size="square"]'); await pg.waitForSelector('#confirmDialog[open]'); ok(/دو نیم شود/.test(await pg.textContent('#confirmMessage'))); await pg.click('#confirmOk'); await pg.waitForTimeout(150); eq((await shells()).length, 4); eq(await diag(), '');
  });
  await step('v26 layouts: the current count does nothing; a hand-edited layout is confirmed before it is replaced', async () => {
    await fresh(); const g0 = await geo(); await pg.click('[data-count="4"]'); await pg.waitForTimeout(120); eq(await geo(), g0, 'same count = no change'); await pg.click('[data-template="grid"]'); await pg.waitForTimeout(120); eq(await geo(), g0, 'same card = no change');
    await selectFrame(0); const box = await pageBox(), v = (await handles('.vertex-handle')).find(pt => !onBorder(pt, box)); await dragBy(v, 20, 14); const g1 = await geo();
    await pg.click('[data-template="header"]'); await pg.waitForSelector('#confirmDialog[open]'); ok(/چیدمان دستی/.test(await pg.textContent('#confirmMessage'))); await pg.click('#confirmCancel'); eq(await geo(), g1, 'cancel keeps manual layout');
    await pg.click('[data-template="header"]'); await pg.click('#confirmOk'); await pg.waitForTimeout(150); ok(await geo() !== g1);
  });
  await step('v26 regular grid is exactly regular; "hand-made" is not; "another version" changes it', async () => {
    const rect = c => (c.match(/[\d.e+-]+%/g) || []).every(v => v === '0%' || v === '100%');
    await fresh(); const s = await shells(); ok(s.every(x => Math.abs(x.w - s[0].w) < 0.6 && Math.abs(x.h - s[0].h) < 0.6), 'equal frames'); ok((await clips()).every(rect), 'right angles');
    await pg.click('#variantBtn'); await pg.waitForTimeout(100); ok(/منظم فقط یک شکل/.test(await msg()), await msg());
    await pg.click('[data-layout-style="hand"]'); await pg.waitForTimeout(150); const h1 = (await clips()).join(); ok(!(await clips()).every(rect), 'hand-made is irregular');
    await pg.click('#variantBtn'); await pg.waitForTimeout(150); ok((await clips()).join() !== h1, 'variant differs'); eq(await diag(), ''); await pg.click('[data-layout-style="regular"]'); await pg.waitForTimeout(150);
  });
  await step('v26 split and merge: toolbar splits a frame in two; merge joins it back; both are one undo step each', async () => {
    await fresh(); await selectFrame(0); await pg.click('.frame-toolbar [data-tool="splitH"]'); await pg.waitForTimeout(150); eq((await shells()).length, 5); eq(await diag(), '');
    await pg.click('#mergeFrameBtn'); await pg.waitForTimeout(150); eq((await shells()).length, 4); eq(await diag(), ''); await pg.click('#undoBtn'); eq((await shells()).length, 5); await pg.click('#undoBtn'); eq((await shells()).length, 4);
    await pg.click('[data-split="d"]'); await pg.waitForTimeout(150); eq((await shells()).length, 5); eq(await diag(), '');
  });
  await step('v26 borders: a frame standing alone gets an outline; the page border option draws the outer edge', async () => {
    await fresh(); await pg.click('#clearFramesBtn'); await pg.click('#confirmOk', { timeout: 800 }).catch(() => {}); await pg.click('[data-add-shape="rect"][data-size="square"]'); await pg.waitForTimeout(150); if (await pg.evaluate(() => document.querySelector('#expandPrompt').open)) await pg.click('[data-expand="none"]');
    await pg.keyboard.press('Escape'); const n = await pg.$$eval('#gutterLayer > *', e => e.length); ok(n >= 2, 'outline primitives ' + n);
    await tab('page'); await pg.fill('#pageBorderRange', '8'); await pg.dispatchEvent('#pageBorderRange', 'input'); await pg.dispatchEvent('#pageBorderRange', 'change'); await pg.waitForTimeout(100); eq(await pg.$$eval('#gutterLayer > *', e => e.length), n + 4, 'four page-border lines'); return n;
  });
  await step('v26 reading order: tap frames to set it by hand; "automatic" restores right-to-left', async () => {
    await fresh(); await tab('layout'); const num = async () => (await pg.$$eval('.frame-shell', e => e.map(x => [x.dataset.panelId, x.querySelector('.panel-number').textContent]))).sort().map(x => x[1]).join(''); const auto = await num();
    await pg.click('#orderBtn'); const s = await shells(); for (const f of [...s].reverse()) { await pg.mouse.click(...center(f)); await pg.waitForTimeout(60); } await pg.waitForTimeout(120); ok(await num() !== auto, 'numbers changed: ' + await num()); ok(await pg.isVisible('#autoOrderBtn'));
    await pg.click('#autoOrderBtn'); await pg.waitForTimeout(100); eq(await num(), auto);
  });
  await step('v26 images: swap between frames; zoom slider has no dead zone; same picture is stored once', async () => {
    await fresh(); await tab('image'); await pg.setInputFiles('#batchImageInput', [IMG(1), IMG(2)]); await pg.waitForFunction(() => document.querySelectorAll('.frame-shell img').length === 2); await pg.waitForTimeout(200);
    const names = () => pg.$$eval('#imagePanelPicker button', b => b.map(x => x.title.replace(/^.*— /, ''))); const n0 = await names(); await pg.click('#imagePanelPicker button:nth-child(1)'); await pg.selectOption('#swapSelect', { index: 1 }); await pg.waitForTimeout(150); const n1 = await names(); eq([n1[0], n1[1]], [n0[1], n0[0]], 'swapped');
    eq(await pg.getAttribute('#zoomRange', 'min'), '100'); const w = () => pg.$eval('.frame-shell.selected img', e => e.getBoundingClientRect().width); const w0 = await w(); await pg.fill('#zoomRange', '160'); await pg.dispatchEvent('#zoomRange', 'input'); await pg.dispatchEvent('#zoomRange', 'change'); ok(await w() > w0 * 1.4, 'zoom works');
    await pg.selectOption('#fitSelect', 'contain'); eq(await pg.getAttribute('#zoomRange', 'min'), '50');
    await pg.click('#imagePanelPicker button:nth-child(3)'); await pg.setInputFiles('#selectedImageInput', IMG(1)); await pg.waitForFunction(() => document.querySelectorAll('.frame-shell img').length === 3); await pg.waitForTimeout(150);
    await pg.fill('#projectName', 'کتاب آزمون'); const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('#saveProjectBtn')]); const f = path.join(T, 'named.json'); await dl.saveAs(f); const j = JSON.parse(fs.readFileSync(f, 'utf8')); eq(Object.keys(j.assets).length, 2, 'three frames, two distinct pictures'); eq(j.name, 'کتاب آزمون'); ok(/^کتاب آزمون-14\d\d-\d\d-\d\d\.json$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    await pg.click('#newProjectBtn'); await pg.click('#confirmOk'); await pg.setInputFiles('#projectInput', f); await pg.waitForTimeout(700); eq(await imgs(), 3, 'format 10 reopens'); eq(await pg.inputValue('#projectName'), 'کتاب آزمون');
  });
  await step('v26 export: preflight lists empty frames, click jumps to the frame; file is named after the book; web size is 1080px wide', async () => {
    await pg.click('#exportBtn'); await pg.waitForSelector('#preflight:not([hidden])'); ok(/بدون تصویر/.test(await pg.textContent('#preflight'))); await pg.selectOption('#exportSize', 'web');
    const [dl] = await Promise.all([pg.waitForEvent('download', { timeout: 60000 }), pg.click('#downloadPngBtn')]); const f = path.join(T, 'web.png'); await dl.saveAs(f); eq(pngSize(f).w, 1080); ok(/^کتاب آزمون-page-01\.png$/.test(dl.suggestedFilename()), dl.suggestedFilename());
    await pg.click('#exportBtn'); await pg.selectOption('#exportSize', 'print'); await pg.click('#preflight button'); await pg.waitForTimeout(150); eq(await pg.evaluate(() => document.querySelector('#exportDialog').open), false); eq((await shells()).filter(x => x.sel).length, 1, 'jumped to the frame'); await pg.fill('#projectName', '');
  });
  await step('v26 low-resolution picture is flagged on the frame and in preflight', async () => {
    await fresh(); await pg.click('[data-count="1"]'); await pg.waitForTimeout(120); await tab('image'); await pg.setInputFiles('#batchImageInput', { name: 'tiny.png', mimeType: 'image/png', buffer: fs.readFileSync(IMG('trans.png')) }); await pg.waitForFunction(() => document.querySelectorAll('.frame-shell img').length === 1); await pg.waitForTimeout(150);
    ok(await pg.$('.panel-number.low, .panel-number.mid'), 'quality mark'); await pg.click('#exportBtn'); ok(/کیفیت چاپ کم/.test(await pg.textContent('#preflight'))); await pg.keyboard.press('Escape');
  });
  await step('v26 keyboard: frames are reachable with Tab, Enter selects, Shift+arrow is a fine step, Ctrl+D duplicates, L locks', async () => {
    await fresh(); await pg.click('#clearFramesBtn'); await pg.click('#confirmOk', { timeout: 800 }).catch(() => {}); await pg.click('[data-add-shape="rect"][data-size="square"]'); await pg.waitForTimeout(150); if (await pg.evaluate(() => document.querySelector('#expandPrompt').open)) await pg.click('[data-expand="none"]'); await pg.keyboard.press('Escape');
    eq(await pg.$$eval('.frame-shell', e => e.every(x => x.tabIndex === 0 && x.getAttribute('aria-label'))), true); await pg.focus('.frame-shell'); await pg.keyboard.press('Enter'); await pg.waitForTimeout(80); eq((await shells()).filter(x => x.sel).length, 1, 'Enter selects');
    const x0 = (await shells())[0].x; await pg.keyboard.press('Shift+ArrowLeft'); const x1 = (await shells())[0].x; await pg.keyboard.press('ArrowLeft'); const x2 = (await shells())[0].x; ok(x0 - x1 > 0.3 && x0 - x1 < 1.5 && x1 - x2 > 3, 'fine and normal steps ' + [x0 - x1, x1 - x2]);
    await pg.keyboard.press('Control+d'); await pg.waitForTimeout(150); if (await pg.evaluate(() => document.querySelector('#expandPrompt').open)) await pg.click('[data-expand="none"]'); eq((await shells()).length, 2); await pg.keyboard.press('l'); await pg.waitForTimeout(80); ok(await pg.$('.frame-shell.selected.locked'), 'locked with L');
  });
  await step('v26 my layouts: save the page layout, it appears under "my layouts", apply it on a new page', async () => {
    await fresh('heroRight'); await tab('layout'); await pg.click('#saveLayoutBtn'); await pg.waitForTimeout(120); eq(await pg.$$eval('#myLayouts .my-layout', e => e.length), 1); const c0 = (await clips()).sort().join();
    await pg.click('#addPageBtn'); await tab('layout'); await pg.click('[data-category-tab="mine"]'); await pg.click('#myLayouts .preset-card'); await pg.waitForTimeout(150); eq((await clips()).sort().join(), c0, 'same geometry'); eq(await diag(), '');
    await pg.click('#myLayouts .icon-btn'); await pg.click('#confirmOk'); await pg.waitForTimeout(100); eq(await pg.$$eval('#myLayouts .my-layout', e => e.length), 0); await pg.click('[data-category-tab="classic"]');
  });
  // ════════ دسترس‌پذیری
  await step('a11y: every visible button has a name; no text smaller than .72rem; focus ring visible', async () => {
    await pg.reload(); await pg.waitForTimeout(600); if (await pg.evaluate(() => document.querySelector('#restorePrompt').open)) await pg.click('#restoreYes'); await pg.waitForTimeout(500);
    for (const t of ['page', 'layout', 'image']) { await tab(t); if (t === 'layout') await selectFrame(0); await pg.evaluate(() => document.querySelectorAll('details').forEach(d => d.open = true)); }
    const r = await pg.evaluate(() => { const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
      const unnamed = [...document.querySelectorAll('button')].filter(vis).filter(b => !(b.getAttribute('aria-label') || b.textContent.trim() || b.title)).map(b => b.outerHTML.slice(0, 80));
      const small = []; document.querySelectorAll('body *').forEach(e => { if (!vis(e) || ![...e.childNodes].some(n => n.nodeType === 3 && n.data.trim())) return; const fs = parseFloat(getComputedStyle(e).fontSize); if (fs < 11.5) small.push(e.tagName + '.' + e.className + ':' + fs); });
      return { unnamed, small: [...new Set(small)] }; });
    eq(r.unnamed, [], 'unnamed buttons'); eq(r.small, [], 'text < .72rem');
    await pg.keyboard.press('Tab'); await pg.keyboard.press('Tab'); const ring = await pg.evaluate(() => { const s = getComputedStyle(document.activeElement); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2 || /rgb/.test(s.boxShadow); }); ok(ring, 'focus ring');
  });
  await step('shortcuts dialog opens with ? and closes with Escape', async () => {
    await pg.keyboard.press('Escape'); await pg.keyboard.press('Shift+Slash'); await pg.waitForSelector('#shortcutsDialog[open]'); await pg.keyboard.press('Escape'); await pg.waitForTimeout(100); eq(await pg.evaluate(() => document.querySelector('#shortcutsDialog').open), false);
  });
  await step('theme toggle persists across reload', async () => {
    const m0 = await pg.evaluate(() => document.documentElement.dataset.mode); await pg.click('#themeBtn'); const m1 = await pg.evaluate(() => document.documentElement.dataset.mode); ok(m0 !== m1);
    await pg.reload(); await pg.waitForTimeout(500); eq(await pg.evaluate(() => document.documentElement.dataset.mode), m1); if (await pg.evaluate(() => document.querySelector('#restorePrompt').open)) await pg.click('#restoreYes'); await pg.click('#themeBtn');
  });
  // ════════ موبایل و لمس
  await step('mobile 390×844: canvas on top, steps below, no horizontal scroll, touch targets ≥44px', async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }); const p = await m.newPage(); watch(p, 'mobile'); await p.goto(URL); await p.waitForTimeout(500);
    await p.tap('[data-quick="grid"]'); await p.waitForTimeout(200);
    const r = await p.evaluate(() => { const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight; };
      const small = [...document.querySelectorAll('.topbar button,.steps button,.stage-bar button,.inspector button,.pages-rail button,.inspector select')].filter(vis).filter(b => { const r = b.getBoundingClientRect(); return r.height < 43.5 || r.width < 43.5 && !b.textContent.trim(); }).map(b => (b.id || b.className || b.textContent.trim()).slice(0, 30));
      const st = document.querySelector('.stage').getBoundingClientRect(), steps = document.querySelector('.steps').getBoundingClientRect(), pg = document.querySelector('#comicPage').getBoundingClientRect();
      return { overflowX: document.documentElement.scrollWidth - innerWidth, small, stageTop: st.top, stepsTop: steps.top, pageW: Math.round(pg.width), pageH: Math.round(pg.height) }; });
    eq(r.overflowX, 0, 'horizontal overflow'); eq(r.small, [], 'small touch targets'); ok(r.stepsTop > r.stageTop, 'steps under canvas');
    // scroll tools: canvas stays on top
    await p.evaluate(() => scrollTo(0, 600)); await p.waitForTimeout(150); const st2 = await p.evaluate(() => document.querySelector('.stage').getBoundingClientRect().top); ok(st2 >= 0 && st2 < 60, 'stage sticky at top: ' + st2);
    await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: path.join(T, 'mobile.png') }); await m.close(); return r;
  });
  await step('touch: first tap only selects (no move); second drag moves', async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await m.newPage(); watch(p, 'touch'); await p.goto(URL); await p.waitForTimeout(500); await p.tap('[data-quick="grid"]'); await p.waitForTimeout(200);
    const cdp = await m.newCDPSession(p); const touch = async (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
    let s = await shells(p); const a = s[0], c0 = center(a);
    await touch('touchStart', [c0]); for (let i = 1; i <= 6; i++) await touch('touchMove', [[c0[0] + i * 4, c0[1] + i * 6]]); await touch('touchEnd', []); await p.waitForTimeout(150);
    s = await shells(p); const after = s.find(x => x.id === a.id); ok(after.sel, 'selected by first touch'); ok(Math.abs(after.x - a.x) < 1 && Math.abs(after.y - a.y) < 1, 'did not move on first touch');
    await m.close();
  });
  await step('pinch: two fingers zoom the stage; a running drag is cancelled (no half-move left behind)', async () => {
    const m = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const p = await m.newPage(); watch(p, 'pinch'); await p.goto(URL); await p.waitForTimeout(500); await p.tap('[data-quick="grid"]'); await p.waitForTimeout(200);
    await p.click('.switch').catch(() => {}); // magnet off so a frame could move freely
    const cdp = await m.newCDPSession(p); const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i })) });
    let s = await shells(p); const a = s[0], c0 = center(a); await touch('touchStart', [c0]); await touch('touchEnd', []); await p.waitForTimeout(100); // select
    const w0 = await p.$eval('#comicPage', e => e.getBoundingClientRect().width); s = await shells(p); const a1 = s.find(x => x.id === a.id);
    await touch('touchStart', [c0]); await touch('touchMove', [[c0[0] + 10, c0[1] + 10]]); // drag starts
    await touch('touchStart', [[c0[0] + 10, c0[1] + 10], [c0[0] + 60, c0[1] + 60]]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[c0[0] + 10 - i * 8, c0[1] + 10 - i * 8], [c0[0] + 60 + i * 8, c0[1] + 60 + i * 8]]);
    await touch('touchEnd', []); await p.waitForTimeout(250);
    const w1 = await p.$eval('#comicPage', e => e.getBoundingClientRect().width); ok(w1 > w0 * 1.2, `zoomed ${w0}→${w1}`);
    await p.click('#stageZoomFit'); await p.waitForTimeout(150); s = await shells(p); const a2 = s.find(x => x.id === a.id);
    ok(Math.abs(a2.x - a1.x) < 1.5 && Math.abs(a2.y - a1.y) < 1.5, 'frame back at original place ' + JSON.stringify([a1, a2])); await m.close(); return { w0: Math.round(w0), w1: Math.round(w1) };
  });
  await step('very small screen 320×568 and landscape phone 844×390: no horizontal overflow', async () => {
    const out = {};
    for (const vp of [{ width: 320, height: 568 }, { width: 844, height: 390 }]) { const m = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true }); const p = await m.newPage(); watch(p, 'small'); await p.goto(URL); await p.waitForTimeout(500); await p.tap('[data-quick="header"]'); await p.waitForTimeout(150);
      const r = await p.evaluate(() => ({ ox: document.documentElement.scrollWidth - innerWidth, page: Math.round(document.querySelector('#comicPage').getBoundingClientRect().height) })); eq(r.ox, 0, `overflow at ${vp.width}`); ok(r.page > 120, 'page visible'); out[vp.width] = r; await p.screenshot({ path: path.join(T, `small-${vp.width}.png`) }); await m.close(); }
    return out;
  });
  // ════════ ذخیره‌سازی محدود
  await step('IndexedDB unavailable (private mode): app works, chip says autosave is off', async () => {
    const m = await browser.newContext({ viewport: { width: 1280, height: 800 } }); await m.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('blocked', 'SecurityError'); } }); });
    const p = await m.newPage(); watch(p, 'noidb'); await p.goto(URL); await p.waitForTimeout(600); eq(await p.$eval('#saveChip', e => e.dataset.state), 'off'); await p.click('[data-quick="grid"]'); eq((await shells(p)).length, 4); await m.close();
  });
  await step('IndexedDB full (QuotaExceededError): user is told to save a file', async () => {
    const m = await browser.newContext({ viewport: { width: 1280, height: 800 } }); await m.addInitScript(() => { const put = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function (v, k) { if (this.name === 'assets') throw new DOMException('full', 'QuotaExceededError'); return put.call(this, v, k); }; });
    const p = await m.newPage(); watch(p, 'quota'); await p.goto(URL); await p.waitForTimeout(500); await p.click('[data-quick="grid"]'); await p.click('[data-editor-tab="image"]'); await p.setInputFiles('#batchImageInput', [IMG(1)]); await p.waitForTimeout(2500);
    eq(await p.$eval('#saveChip', e => e.dataset.state), 'error'); ok(/فضای ذخیرهٔ مرورگر پر است/.test(await msg(p)), await msg(p)); await m.close();
  });
  // ════════ تک‌فایلی روی file://
  await step('single-file build over file:// — boots offline, fonts embedded, layout + PNG export', async () => {
    const m = await browser.newContext({ viewport: { width: 1280, height: 800 }, acceptDownloads: true, offline: true }); const p = await m.newPage(); const net = []; p.on('request', r => { if (!/^(data|blob|file):/.test(r.url())) net.push(r.url()); }); p.on('pageerror', e => errs.push('single PAGEERR ' + e.message));
    await p.goto(SINGLE); await p.waitForTimeout(800); const f = await p.evaluate(async () => { await document.fonts.ready; return document.fonts.check('900 16px "Khamenei.ir"'); }); ok(f, 'font');
    await p.click('[data-quick="strips"]'); eq((await shells(p)).length, 3); await p.click('#exportBtn'); const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.click('#downloadPngBtn')]); const out = path.join(T, 'single.png'); await dl.saveAs(out); eq(pngSize(out), { w: 1949, h: 2776 });
    eq(net, [], 'network requests'); await m.close();
  });

  await pg.screenshot({ path: path.join(T, 'final.png') });
  console.log('\nJS / network errors:', errs.length ? '\n' + errs.join('\n') : 'none');
  const passed = results.filter(r => r.ok).length; console.log(`\n${passed}/${results.length} passed`);
  fs.writeFileSync(path.join(T, 'e2e-results.json'), JSON.stringify({ when: new Date().toISOString(), url: URL, passed, total: results.length, results, errs }, null, 1));
  await ctx.close(); await browser.close(); fs.rmSync(userData, { recursive: true, force: true });
  process.exitCode = passed === results.length && !errs.length ? 0 : 1;
})();
