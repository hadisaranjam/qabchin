'use strict';
// قاب‌چین کمیک — گردش کار کامل روی شبیه‌سازی گوشی (پروفایل‌های Playwright در Chromium).
// این آزمون جای گوشی واقعی و موتور Safari را نمی‌گیرد؛ اندازه، تراکم پیکسل، لمس و user-agent را شبیه‌سازی می‌کند.
// اجرا:  node tools/devices.cjs <پوشهٔ کار موقتی که e2e در آن فایل آزمون ساخته> [URL]
process.env.LC_ALL = process.env.LC_ALL || 'C.UTF-8';
const { chromium, devices } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(process.argv[2]), URL = process.argv[3] || 'http://127.0.0.1:8123/index.html';
const F = path.join(S, 'e2e', 'fx'), OUT = path.join(S, 'devices'); fs.mkdirSync(OUT, { recursive: true });
const PROFILES = [['iPhone 13', false], ['iPhone 13', true], ['iPhone SE', false], ['Pixel 7', false], ['Pixel 7', true], ['Galaxy Tab S4', false]];
const results = [];
(async () => {
  const browser = await chromium.launch();
  for (const [name, landscape] of PROFILES) {
    const d = devices[name + (landscape ? ' landscape' : '')], label = name + (landscape ? ' افقی' : '');
    const ctx = await browser.newContext({ ...d, acceptDownloads: true }); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => m.type() === 'error' && errs.push(m.text()));
    const cdp = await ctx.newCDPSession(p), touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    const shells = () => p.evaluate(() => [...document.querySelectorAll('.frame-shell')].map(s => { const r = s.getBoundingClientRect(); return { id: s.dataset.panelId, x: r.x, y: r.y, w: r.width, h: r.height, sel: s.classList.contains('selected') } }));
    const r = { device: label, viewport: `${d.viewport.width}×${d.viewport.height}` }, fail = [];
    const check = (ok, what) => { if (!ok) fail.push(what); };
    try {
      await p.goto(URL); await p.waitForTimeout(600);
      await p.tap('[data-quick="grid"]'); await p.waitForTimeout(200); check((await shells()).length === 4, 'چیدمان سریع');
      await p.tap('[data-editor-tab="image"]'); await p.setInputFiles('#batchImageInput', [1, 2, 3, 4].map(i => path.join(F, `p${i}.jpg`)));
      await p.waitForFunction(() => document.querySelectorAll('.frame-shell img').length === 4, null, { timeout: 20000 }).catch(() => check(false, 'ورود ۴ عکس'));
      await p.tap('[data-editor-tab="layout"]'); await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(150);
      let s = await shells(); const a = s[0], c = [a.x + a.w / 2, a.y + a.h / 2];
      await touch('touchStart', [c]); await touch('touchEnd', []); await p.waitForTimeout(150);
      s = await shells(); check(s.find(x => x.id === a.id).sel, 'انتخاب با لمس اول');
      const w0 = await p.$eval('#comicPage', e => e.getBoundingClientRect().width);
      await touch('touchStart', [[c[0] - 20, c[1] - 20], [c[0] + 20, c[1] + 20]]); for (let i = 1; i <= 6; i++) await touch('touchMove', [[c[0] - 20 - i * 10, c[1] - 20 - i * 10], [c[0] + 20 + i * 10, c[1] + 20 + i * 10]]); await touch('touchEnd', []); await p.waitForTimeout(250);
      const w1 = await p.$eval('#comicPage', e => e.getBoundingClientRect().width); check(w1 > w0 * 1.3, 'زوم دو انگشتی'); await p.tap('#stageZoomFit'); await p.waitForTimeout(150);
      const m = await p.evaluate(() => { const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden' && r.top < innerHeight && r.bottom > 0; };
        const small = [...document.querySelectorAll('.topbar button,.steps button,.stage-bar button,.inspector button,.pages-rail button')].filter(vis).filter(b => { const r = b.getBoundingClientRect(); return r.height < 43.5; }).map(b => b.id || b.textContent.trim().slice(0, 12));
        const pg = document.querySelector('#comicPage').getBoundingClientRect(), st = document.querySelector('.stage').getBoundingClientRect();
        return { ox: document.documentElement.scrollWidth - innerWidth, small, pageShare: Math.round(pg.width * pg.height / (innerWidth * innerHeight) * 100), stageTop: Math.round(st.top) }; });
      check(m.ox === 0, 'بدون اسکرول افقی'); check(!m.small.length, 'هدف لمسی ۴۴px: ' + m.small.join('، '));
      r.pageShare = m.pageShare + '٪ صفحهٔ نمایش'; await p.screenshot({ path: path.join(OUT, `${name.replace(/\s/g, '-')}${landscape ? '-land' : ''}.png`) });
      await p.evaluate(() => scrollTo(0, 700)); await p.waitForTimeout(120); const st2 = await p.evaluate(() => Math.round(document.querySelector('.stage').getBoundingClientRect().top)); check(st2 >= 0 && st2 < 70, 'بوم بالا ثابت می‌ماند');
      await p.evaluate(() => scrollTo(0, 0)); await p.tap('#exportBtn');
      const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), p.tap('#downloadPngBtn')]); const f = path.join(OUT, 'x.png'); await dl.saveAs(f); const b = fs.readFileSync(f); check(b.readUInt32BE(16) === 1949, 'خروجی PNG');
    } catch (e) { fail.push('خطا: ' + e.message.split('\n')[0]); }
    if (errs.length) fail.push('خطای JS: ' + errs.join(' | '));
    r.ok = !fail.length; r.fail = fail; results.push(r); console.log(r.ok ? 'PASS' : 'FAIL', label, JSON.stringify(r));
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'devices-results.json'), JSON.stringify(results, null, 1));
  console.log(`\n${results.filter(x => x.ok).length}/${results.length} devices passed`);
  process.exitCode = results.every(x => x.ok) ? 0 : 1;
})();
