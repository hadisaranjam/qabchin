// عکس از حالت‌های اصلی رابط برای بازبینی چشمی. اجرا: node tools/screens.cjs <پوشهٔ‌تست> <پوشهٔ‌خروجی> [URL]
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const S = process.argv[2], OUT = process.argv[3], URL = process.argv[4] || 'http://127.0.0.1:8123/index.html';
const IMG = i => `${S}/e2e/fx/p${i}.jpg`; fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const b = await chromium.launch();
  for (const scheme of ['light', 'dark']) for (const vp of [{ n: 'd', width: 1440, height: 900 }, { n: 'm', width: 390, height: 844 }]) {
    const ctx = await b.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: scheme, deviceScaleFactor: vp.n === 'm' ? 2 : 1, hasTouch: vp.n === 'm', isMobile: vp.n === 'm' });
    const pg = await ctx.newPage(); const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const shot = async name => { await pg.waitForTimeout(250); await pg.screenshot({ path: path.join(OUT, `${vp.n}-${scheme}-${name}.png`) }); };
    await pg.goto(URL); await pg.waitForTimeout(700); await shot('1-empty');
    const tab = async t => pg.evaluate(t => document.querySelector(`[data-editor-tab="${t}"]`)?.click(), t);
    await pg.evaluate(() => document.querySelector('#beginLayoutBtn')?.click()); await tab('layout');
    await pg.evaluate(() => document.querySelector('[data-count="4"]')?.click()); await pg.evaluate(() => document.querySelector('[data-template="grid"]')?.click()); await pg.waitForTimeout(150);
    await shot('2-layout'); await tab('image'); await pg.setInputFiles('#batchImageInput', [1, 2, 3, 4].map(IMG)); await pg.waitForTimeout(1200); await shot('3-images');
    const s = await pg.$('.frame-shell'); if (s) { const r = await s.boundingBox(); if (vp.n === 'm') await pg.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); else await pg.mouse.click(r.x + r.width / 2, r.y + r.height / 2); }
    await tab('layout'); await shot('4-selected'); await tab('page'); await shot('5-page-tab');
    await pg.evaluate(() => document.querySelector('#exportBtn')?.click()); await shot('6-export');
    await pg.keyboard.press('Escape'); await tab('layout'); const s2 = await pg.$('.frame-shell'); if (s2) { const r = await s2.boundingBox(); if (vp.n === 'm') await pg.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); else await pg.mouse.click(r.x + r.width / 2, r.y + r.height / 2); }
    await pg.evaluate(() => document.querySelector('#toggleLockBtn')?.click()); await pg.evaluate(() => document.querySelector('#deleteFrameBtn')?.click()); await shot('7-confirm');
    await pg.evaluate(() => document.querySelector('#confirmCancel')?.click()); await pg.evaluate(() => document.querySelector('#guideBtn')?.click()); await shot('8-help');
    await pg.keyboard.press('Escape'); await tab('image'); await pg.evaluate(() => document.querySelectorAll('.tab-panel.active details').forEach(d => d.open = true)); await shot('9-image-open');
    if (errs.length) console.log(vp.n, scheme, 'ERR', errs);
    await ctx.close();
  }
  await b.close(); console.log('screens ->', OUT);
})();
