const {test,expect}=require('@playwright/test');
const path=require('node:path'),fs=require('node:fs');
async function ready(page){await page.goto('/');await page.waitForFunction(()=>window.QabchinWorkspace?.ready());}
async function rename(page,name){await page.locator('#projectName').fill(name);await page.evaluate(()=>window.QabchinWorkspace.flush());}
async function connect(page){await page.locator('#workspaceBtn').click();await page.locator('#connectBtn').click();await page.locator('#githubToken').fill('github_pat_fake_for_test_only');await page.locator('#connectionSubmit').click();await expect(page.locator('#connectionDialog')).not.toBeVisible();}
test('name and multiple books survive restart; import preserves earlier book',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await ready(page);await rename(page,'کتاب نخست');
  await page.locator('#workspaceBtn').click();await page.locator('#libraryNewBtn').click();await rename(page,'کتاب دوم');
  await page.reload();await page.waitForFunction(()=>window.QabchinWorkspace?.ready());await expect(page.locator('#projectName')).toHaveValue('کتاب دوم');
  await page.locator('#workspaceBtn').click();await expect(page.locator('.book-card')).toHaveCount(2);await expect(page.locator('.book-card').filter({hasText:'کتاب نخست'})).toBeVisible();
  const fixture=await import('../github-fixture.mjs');await page.locator('#libraryImport').setInputFiles({name:'sample.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture.sampleDoc('کتاب واردشده')))});
  await expect(page.locator('#projectName')).toHaveValue('کتاب واردشده');await page.locator('#workspaceBtn').click();await expect(page.locator('.book-card')).toHaveCount(3);expect(errors).toEqual([]);
});
test('offline cold reload restores saved project and registered app shell',async({page,context})=>{
  await ready(page);await rename(page,'کار آفلاین');await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await page.waitForFunction(()=>window.QabchinWorkspace?.ready());
  await context.setOffline(true);await page.reload();await page.waitForFunction(()=>window.QabchinWorkspace?.ready());await expect(page.locator('#projectName')).toHaveValue('کار آفلاین');
  await rename(page,'ویرایش در حالت آفلاین');await page.reload();await page.waitForFunction(()=>window.QabchinWorkspace?.ready());await expect(page.locator('#projectName')).toHaveValue('ویرایش در حالت آفلاین');
});
test('two independent devices sync images and detect conflicting edits',async({browser})=>{
  const fixture=await import('../github-fixture.mjs'),cloud=fixture.createGitHubFixture();
  const a=await browser.newContext(),b=await browser.newContext();
  async function route(context){await context.route('https://api.github.com/**',async route=>{const req=route.request();const headers=req.headers();const response=await cloud.fetcher(req.url(),{method:req.method(),headers:{...headers,Accept:headers.accept},body:req.postData()});await route.fulfill({status:response.status,contentType:headers.accept==='application/vnd.github.raw+json'?'application/octet-stream':'application/json',body:Buffer.from(await response.arrayBuffer())});});}
  await route(a);await route(b);const pa=await a.newPage(),pb=await b.newPage();await ready(pa);await ready(pb);
  await pa.evaluate(doc=>window.QabchinWorkspace.importFile(new File([JSON.stringify(doc)],'book.json',{type:'application/json'})),fixture.sampleDoc('کتاب مشترک'));
  await connect(pa);await expect(pa.locator('#cloudStatusText')).toContainText('سینک شد');
  await connect(pb);const card=pb.locator('.book-card').filter({hasText:'کتاب مشترک'});await card.getByRole('button',{name:'دریافت و بازکردن'}).click();await expect(pb.locator('#projectName')).toHaveValue('کتاب مشترک');
  const image=await pb.evaluate(()=>Object.values(window.QabchinEditor.document().assets)[0]);expect(image).toBe(fixture.tinyImage);
  await pa.locator('#closeWorkspace').click();await rename(pa,'ویرایش الف');await rename(pb,'ویرایش ب');
  await pa.locator('#workspaceBtn').click();await pa.locator('#syncNowBtn').click();await expect(pa.locator('#cloudStatusText')).toContainText('سینک شد');
  await pb.locator('#workspaceBtn').click();await pb.locator('#syncNowBtn').click();await expect(pb.locator('#conflictBox')).toBeVisible();
  await pb.locator('#keepBothBtn').click();await expect(pb.locator('#projectName')).toHaveValue(/نسخهٔ این دستگاه/);
  await a.close();await b.close();
});
test('invalid token and public repositories do not upload user projects',async({page,context})=>{
  const fixture=await import('../github-fixture.mjs'),cloud=fixture.createGitHubFixture();cloud.setPrivate(false);
  await context.route('https://api.github.com/**',async route=>{const response=await cloud.fetcher(route.request().url());await route.fulfill({status:response.status,body:await response.text(),contentType:'application/json'});});
  await ready(page);await page.locator('#workspaceBtn').click();await page.locator('#connectBtn').click();await page.locator('#githubToken').fill('gho_too_broad');await page.locator('#connectionSubmit').click();await expect(page.locator('#connectionError')).toContainText('کلید محدود');
  await page.locator('#githubToken').fill('github_pat_test');await page.locator('#connectionSubmit').click();await expect(page.locator('#connectionError')).toContainText('خصوصی');expect(cloud.files.size).toBe(0);
});
test('mobile and desktop dialogs fit the viewport; screenshots',async({page},testInfo)=>{
  await ready(page);await rename(page,'قاب‌چین من');await page.locator('#workspaceBtn').click();
  for(const size of [{width:1440,height:1000},{width:390,height:844},{width:768,height:1024}]){
    await page.setViewportSize(size);await expect(page.locator('#workspaceDialog')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    const box=await page.locator('#workspaceDialog').boundingBox();expect(box.width).toBeLessThanOrEqual(size.width);
    await page.screenshot({path:testInfo.outputPath(`library-${size.width}.png`)});
  }
  await page.locator('#closeWorkspace').click();await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:testInfo.outputPath('editor-desktop.png')});
});
