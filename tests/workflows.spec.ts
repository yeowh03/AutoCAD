import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 1000 } });
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Translation provider', { exact: true }).selectOption('demo');
});
const ids = ['locate-demo-translated', 'locate-demo-overflow', 'locate-demo-locked', 'locate-demo-unsupported', 'locate-demo-unchanged'];
const statuses = ['Translated', 'Warning', 'Failed', 'Skipped', 'Skipped'];
async function selectLanguage(page:Page,name:string){
  await page.getByRole('combobox',{name:'Target languages',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search languages',exact:true}).fill(name);
  const option=page.getByRole('option',{name,exact:true});
  if(await option.getAttribute('aria-selected')!=='true')await option.click();
  await page.getByRole('button',{name:'Done',exact:true}).click();
}
async function openDrawing(page: Page, name: string) {
  await page.locator('.drawing-card').filter({ has: page.getByRole('heading', { name, exact: true }) }).getByRole('button', { name: 'Open drawing', exact: true }).click();
  await expect(page.getByTestId('drawing-language')).toBeVisible();
}
async function run(page: Page, original = false) {
  if (original) await page.getByRole('radio', { name: /Translate original file/ }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Translate', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Translation complete', exact: true })).toBeVisible({ timeout: 30000 });
}
async function backToReport(page:Page){
  await page.getByRole('button',{name:'Back to report',exact:true}).click();
  await expect(page.locator('.report')).toBeVisible();
  await expect(page.locator('.locate-navigator')).toHaveCount(0);
}
async function locate(page: Page, id: string, name: string) {
  if(await page.locator('.locate-navigator').count())await backToReport(page);
  await page.getByRole('button', { name: 'Locate ' + id + ' in ' + name, exact: true }).click();
  await expect(page.locator('.drawing-canvas [aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('[data-object-id="' + id + '"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-object-id="' + id + '"]')).toHaveClass(/located/);
  await expect(page.locator('.ribbon-title')).toContainText(name);
  await expect(page.locator('.report')).toHaveCount(0);
  await expect(page.locator('.report-table')).toHaveCount(0);
  await expect(page.locator('.drawing-ribbon').getByRole('button',{name:'Report',exact:true})).toHaveCount(0);
  await expect(page.getByRole('region',{name:'Located translation instance',exact:true})).toBeVisible();
  const center=await page.locator('[data-object-id="'+id+'"] .text-bounds').evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('svg')!.getBoundingClientRect();return {x:Math.abs(a.x+a.width/2-b.x-b.width/2),y:Math.abs(a.y+a.height/2-b.y-b.height/2)};});
  expect(center.x).toBeLessThan(2); expect(center.y).toBeLessThan(2);
}
test('compact setup has only language and output choices, defaults to a copy, and cancels without work', async ({ page }, info) => {
  await page.screenshot({ path: info.outputPath('home.png'), fullPage: true });
  await openDrawing(page, 'Level_01.dwg');
  await page.getByRole('button', { name: 'Translate All', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('Translate the selected drawing text to another language.');
  await expect(dialog.getByRole('combobox')).toHaveCount(1);
  await expect(dialog.locator('[data-selected-language="fr"]')).toBeVisible();
  await expect(dialog.getByRole('radio', { name: /Create translated copy/ })).toBeChecked();
  await expect(dialog.getByRole('radio')).toHaveCount(2);
  await expect(dialog.getByRole('checkbox')).toHaveCount(0);
  await expect(dialog.getByRole('region',{name:'MT API preview',exact:true})).toBeVisible();
  await expect(page.getByTestId('mt-preview-total')).toHaveText('15');
  await expect(dialog).not.toContainText(/glossary|preset|filter|estimated|objects/i);
  await page.screenshot({ path: info.outputPath('compact-dialog.png') });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cad-translate-studio-v2')!));
  expect(stored.jobs).toHaveLength(0);
  expect(stored.drawings).toHaveLength(5);
  await expect(page.getByLabel('Display language', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Display mode', { exact: true })).toHaveCount(0);
  await expect(page.locator('.language-panel')).toHaveCount(0);
});
test('Locate demo keeps navigation within the located status while report filters stay unchanged', async ({ page }, info) => {
  await page.getByLabel('Translation provider', { exact: true }).selectOption('gemini');
  await page.getByRole('button', { name: 'Try Locate demo', exact: true }).click();
  await expect(page.getByLabel('Translation provider', { exact: true })).toHaveValue('demo');
  await expect(page.locator('[data-selected-language="fr"]')).toBeVisible();
  await run(page);
  await expect(page.locator('.report tbody tr')).toHaveCount(5);
  await expect(page.locator('.report-stats>button')).toHaveCount(4);
  await expect(page.locator('.report-tabs').getByRole('button',{name:/Unchanged/})).toHaveCount(0);
  await expect(page.locator('.stat-skipped strong')).toHaveText('2');
  const counts=await page.locator('.report-stats strong').allTextContents();
  expect(counts.reduce((sum,count)=>sum+Number(count),0)).toBe(5);
  for(let i=0;i<ids.length;i++){
    const row=page.locator('[data-report-object-id="'+ids[i]+'"]');
    await expect(row).toHaveAttribute('data-report-status',statuses[i]);
    await expect(row.locator('.report-before')).toHaveText('FIRE PUMP ROOM');
  }
  await page.screenshot({path:info.outputPath('demo-five-results.png'),fullPage:true});
  await page.locator('.report-tabs').getByRole('button',{name:/Warnings/}).click();
  await expect(page.locator('.report tbody tr')).toHaveCount(1);
  await locate(page,ids[1],'Locate_Demo_FR.dwg');
  await expect(page.locator('[data-object-id="'+ids[1]+'"]')).toHaveClass(/overflow/);
  await expect(page.locator('.instance-bar')).toContainText('1 warning instance across 1 drawing');
  await expect(page.locator('.instance-navigation').getByRole('button',{name:'Previous',exact:true})).toBeDisabled();
  await expect(page.locator('.instance-navigation').getByRole('button',{name:'Next',exact:true})).toBeDisabled();
  await page.screenshot({path:info.outputPath('demo-warning-located.png')});
  await backToReport(page);
  await expect(page.locator('.report-tabs').getByRole('button',{name:/Warnings/})).toHaveClass('active');
  await page.locator('.report-tabs').getByRole('button',{name:/Failed/}).click();
  await locate(page,ids[2],'Locate_Demo_FR.dwg');
  await expect(page.locator('.navigator-reason')).toHaveText('Object is on a locked layer');
  await expect(page.locator('.instance-navigation').getByRole('button',{name:'Next',exact:true})).toBeDisabled();
  await backToReport(page);
  await page.locator('.report-tabs').getByRole('button',{name:/Skipped/}).click();
  await expect(page.locator('.report tbody tr')).toHaveCount(2);
  await locate(page,ids[3],'Locate_Demo_FR.dwg');
  await expect(page.locator('.instance-bar')).toContainText('2 skipped instances across 1 drawing');
  await expect(page.locator('.navigator-reason')).toHaveText('Object type not supported');
  await expect(page.locator('.instance-navigation').getByRole('button',{name:'Previous',exact:true})).toBeDisabled();
  await page.locator('.instance-navigation').getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.locator('.locate-navigator')).toHaveAttribute('data-active-object-id',ids[4]);
  await expect(page.locator('.locate-navigator')).toHaveAttribute('data-active-status','Skipped');
  await expect(page.locator('.navigator-reason')).toHaveText('Offline MT simulation returned the submitted text unchanged');
  await expect(page.locator('[data-object-id="'+ids[4]+'"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.instance-navigation').getByRole('button',{name:'Next',exact:true})).toBeDisabled();
  await page.locator('.instance-navigation').getByRole('button',{name:'Previous',exact:true}).click();
  await expect(page.locator('.locate-navigator')).toHaveAttribute('data-active-object-id',ids[3]);
  await expect(page.locator('.locate-navigator')).toHaveAttribute('data-active-status','Skipped');
  await expect(page.locator('.navigator-reason')).toHaveText('Object type not supported');
  await backToReport(page);
  await expect(page.locator('.report-tabs').getByRole('button',{name:/Skipped/})).toHaveClass('active');
  await page.locator('.report-tabs').getByRole('button',{name:/^All/}).click();
  for(const id of ids)await locate(page,id,'Locate_Demo_FR.dwg');
});
test('three-object selection makes an independent partial copy', async ({ page }) => {
  await openDrawing(page, 'Mechanical_Plan.dwg');
  for (const id of ['txt-001', 'txt-002', 'txt-003']) await page.locator('[data-object-id="' + id + '"]').click();
  await page.getByRole('button', { name: /Translate Selection/ }).click();
  await run(page);
  await expect(page.locator('.report tbody tr')).toHaveCount(3);
  await locate(page, 'txt-001', 'Mechanical_Plan_FR.dwg');
  await expect(page.getByTestId('drawing-language')).toContainText('French');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text', 'INSTALLER AHU-01 AU-DESSUS DU PLAFOND');
  await expect(page.locator('[data-object-id="txt-004"]')).toHaveAttribute('data-retained', 'true');
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await openDrawing(page, 'Mechanical_Plan.dwg');
  await expect(page.getByTestId('drawing-language')).toContainText('English');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text', 'INSTALL AHU-01 ABOVE CEILING');
});
test('original replacement keeps filename, immutable report history, and editable current text after reload', async ({ page }) => {
  await openDrawing(page, 'Level_01.dwg');
  await page.locator('[data-object-id="txt-001"]').click();
  await page.getByRole('button', { name: /Translate Selection/ }).click();
  await run(page, true);
  await locate(page, 'txt-001', 'Level_01.dwg');
  await expect(page.getByTestId('drawing-language')).toContainText('French');
  await page.locator('[data-object-id="txt-001"]').focus();
  await page.keyboard.press('F2');
  await expect(page.getByRole('dialog').getByRole('combobox')).toHaveCount(0);
  await page.getByLabel('Drawing text', { exact: true }).fill('MANUAL ROOM LABEL');
  await page.getByRole('button', { name: 'Save text', exact: true }).click();
  await backToReport(page);
  await expect(page.locator('.report tbody tr')).toContainText('FIRE PUMP ROOM');
  await expect(page.locator('.report tbody tr')).toContainText('LOCAL DES POMPES INCENDIE');
  await expect(page.locator('.report tbody tr')).not.toContainText('MANUAL ROOM LABEL');
  await locate(page,'txt-001','Level_01.dwg');
  await page.getByRole('button', { name: /Translate Selection/ }).click();
  await run(page, true);
  await expect(page.locator('.report tbody tr')).toHaveAttribute('data-report-status', 'Skipped');
  await expect(page.locator('.report')).toContainText('Offline MT simulation returned the submitted text unchanged');
  await page.reload();
  await openDrawing(page, 'Level_01.dwg');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text', 'MANUAL ROOM LABEL');
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('cad-translate-studio-v2')!));
  expect(persisted.drawings).toHaveLength(5);
  expect(persisted.jobs[1].rows[0].original).toBe('FIRE PUMP ROOM');
  expect(persisted.jobs[1].rows[0].translation).toBe('LOCAL DES POMPES INCENDIE');
});
test('copy naming uses the base filename and resolves repeated output collisions', async ({ page }) => {
  await openDrawing(page, 'Site_Plan.dwg');
  await page.getByRole('button', { name: 'Translate All', exact: true }).click();
  await run(page);
  await locate(page, 'txt-001', 'Site_Plan_FR.dwg');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text', 'ENTRÉE DU SITE');
  await page.getByRole('button', { name: 'Translate All', exact: true }).click();
  await run(page);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  for (const name of ['Site_Plan.dwg', 'Site_Plan_FR.dwg', 'Site_Plan_FR_2.dwg']) await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await openDrawing(page, 'Site_Plan.dwg');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text', 'SITE ENTRANCE');
});
test('batch scope, per-file progress, drawing filters, and cross-file instance navigation', async ({ page }, info) => {
  await page.getByRole('button', { name: 'Translate Drawings', exact: true }).click();
  for (const name of ['Level_01.dwg', 'Level_02.dwg', 'Site_Plan.dwg']) await page.getByRole('checkbox', { name: 'Select ' + name, exact: true }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toContainText(/preset|filter|objects/i);
  await page.getByRole('dialog').getByRole('button', { name: 'Translate', exact: true }).click();
  await expect(page.locator('.progress-files>div')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('batch-progress.png') });
  await expect(page.getByRole('heading', { name: 'Translation complete', exact: true })).toBeVisible();
  await page.getByLabel('Filter report by drawing', { exact: true }).selectOption({ label: 'Site_Plan_FR.dwg' });
  await expect(page.locator('.report tbody tr')).toHaveCount(26);
  await locate(page, 'txt-017', 'Site_Plan_FR.dwg');
  // Matching Skipped instances remain reachable across files without crossing statuses.
  await expect(page.locator('.instance-bar')).toContainText('6 skipped instances across 3 drawings');
  await page.locator('.instance-bar').getByRole('button', { name: 'Previous', exact: true }).click();
  await expect(page.locator('.ribbon-title')).toContainText('Level_02_FR.dwg');
});
test('fresh Locate inputs preserve previous originals, copies, and reports', async ({ page }) => {
  await page.getByRole('button', { name: 'Try Locate demo', exact: true }).click();
  await run(page, true);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Try Locate demo', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Translate Locate_Demo_2.dwg', exact: true })).toBeVisible();
  await run(page);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Locate_Demo.dwg', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Locate_Demo_2.dwg', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Locate_Demo_FR.dwg', exact: true })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cad-translate-studio-v2')!));
  expect(stored.jobs).toHaveLength(2);
  expect(stored.drawings.find((d: {name:string}) => d.name === 'Locate_Demo_2.dwg').objects.every((o:{text:string}) => o.text === 'FIRE PUMP ROOM')).toBe(true);
});
test('locked objects refuse editing and preserve retained input text', async ({ page }) => {
  await page.getByRole('button', { name: 'Try Locate demo', exact: true }).click();
  await run(page);
  await locate(page, ids[2], 'Locate_Demo_FR.dwg');
  await page.locator('[data-object-id="' + ids[2] + '"]').dblclick();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.notice[role="status"]')).toContainText('locked layer');
  await expect(page.locator('[data-object-id="' + ids[2] + '"]')).toHaveAttribute('data-display-text', 'FIRE PUMP ROOM');
});
test('interrupted jobs retain partial output and reload makes no requests', async ({ page }) => {
  await page.getByRole('button', { name: 'Translate Drawings', exact: true }).click();
  for (const name of ['Level_01.dwg', 'Level_02.dwg', 'Mechanical_Plan.dwg', 'Site_Plan.dwg']) await page.getByRole('checkbox', { name: 'Select ' + name, exact: true }).check();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Translate', exact: true }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('cad-translate-studio-v2') || '{}').jobs?.[0]?.rows?.some((r: { status: string }) => r.status === 'Translated' || r.status === 'Warning'));
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem('cad-translate-studio-v2')!).drawings);
  let requests = 0;
  page.on('request', request => { if (request.url().includes('generativelanguage')) requests++; });
  await page.reload();
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await page.getByRole('button', { name: /Translation reports/ }).click();
  await expect(page.getByRole('heading', { name: 'Translation interrupted', exact: true })).toBeVisible();
  await expect(page.locator('.report')).toContainText('Interrupted by page reload');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('cad-translate-studio-v2')!).drawings);
  for (const drawing of before) for (const object of drawing.objects) {
    if (object.language === 'fr') expect(after.find((d:{id:string})=>d.id===drawing.id).objects.find((o:{id:string})=>o.id===object.id).text).toBe(object.text);
  }
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Reset demo data', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Reset demo data', exact: true }).click();
  await expect(page.locator('.drawing-card')).toHaveCount(5);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('cad-translate-studio-v2')!).jobs.length)).toBe(0);
});
test('legacy language versions migrate once, retain manual edits, and Locate uses the converted output', async ({ page }) => {
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('cad-translate-studio-v1', JSON.stringify({
      version:1, presets:[{name:'old'}], glossary:[{source:'old'}],
      drawings:[{id:'legacy',name:'Legacy.dwg',discipline:'Architecture',description:'Saved drawing',folder:'Project',
        objects:[{id:'saved-1',type:'MText',sourceText:'SAVED ENGLISH',translations:{fr:'MANUAL FRENCH',de:'MANUAL GERMAN'},layer:'Notes',x:300,y:200,width:250,height:40,locked:false}]}],
      jobs:[{id:'old-job',target:'fr',provider:'demo',status:'Complete',total:1,processed:1,startedAt:'2026-01-01T00:00:00Z',
        files:[{sourceId:'legacy',outputId:'legacy',name:'Legacy.dwg',total:1,processed:1,status:'Complete'}],
        rows:[{id:'old-row',sourceDrawingId:'legacy',outputDrawingId:'legacy',drawingName:'Legacy.dwg',objectId:'saved-1',type:'MText',layer:'Notes',original:'BEFORE SNAPSHOT',translation:'AFTER SNAPSHOT',status:'Translated',reason:'Saved translation',target:'fr'}]}],
    }));
  });
  await page.reload();
  for (const name of ['Legacy.dwg','Legacy_FR.dwg','Legacy_DE.dwg']) await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  await page.getByRole('button',{name:/Translation reports/}).click();
  await expect(page.locator('.report')).toContainText('BEFORE SNAPSHOT');
  await locate(page,'saved-1','Legacy_FR.dwg');
  await expect(page.locator('[data-object-id="saved-1"]')).toHaveAttribute('data-display-text','MANUAL FRENCH');
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem('cad-translate-studio-v2')!));
  expect(first).not.toHaveProperty('glossary'); expect(first).not.toHaveProperty('presets');
  expect(first.jobs[0].rows[0].translation).toBe('AFTER SNAPSHOT');
  await page.reload();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('cad-translate-studio-v2')!).drawings.length)).toBe(first.drawings.length);
});
test('Gemini receives whole current text and source language; auth failure cannot overwrite valid text', async ({ page }) => {
  let fail = false;
  const submitted: {text:string;prompt:string}[] = [];
  await page.route('https://generativelanguage.googleapis.com/**', async route => {
    const headers = {'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type,x-goog-api-key'};
    if (route.request().method() === 'OPTIONS') { await route.fulfill({status:204,headers}); return; }
    const body = JSON.parse(route.request().postData()!);
    const input = JSON.parse(body.contents[0].parts[0].text) as {id:string;text:string}[];
    submitted.push(...input.map(i=>({text:i.text,prompt:body.systemInstruction.parts[0].text})));
    if (fail) { await route.fulfill({status:403,headers,json:{error:{message:'Test authentication failure'}}}); return; }
    await route.fulfill({headers,json:{candidates:[{content:{parts:[{text:JSON.stringify(input.map(i=>({id:i.id,text:'SERVICE RESULT'})))}]}}]}});
  });
  await page.getByLabel('Translation provider',{exact:true}).selectOption('gemini');
  await openDrawing(page,'Mechanical_Plan.dwg');
  await page.locator('[data-object-id="txt-001"]').click();
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await run(page,true);
  expect(submitted[0].text).toBe('INSTALL AHU-01 ABOVE CEILING');
  expect(submitted[0].prompt).toContain('English to French');
  await locate(page,'txt-001','Mechanical_Plan.dwg');
  fail = true;
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await selectLanguage(page,'German');
  await page.getByRole('button',{name:'Remove French',exact:true}).click();
  await run(page,true);
  expect(submitted[1].text).toBe('SERVICE RESULT');
  expect(submitted[1].prompt).toContain('French to German');
  await expect(page.locator('.report')).toContainText('Gemini authentication failed');
  await locate(page,'txt-001','Mechanical_Plan.dwg');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text','SERVICE RESULT');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-language','fr');
});
test('service-derived unchanged results and automatic code exclusions have distinct reasons', async ({ page }) => {
  const submitted:string[]=[];
  await page.route('https://generativelanguage.googleapis.com/**',async route=>{
    const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type,x-goog-api-key'};
    if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
    const body=JSON.parse(route.request().postData()!);
    const input=JSON.parse(body.contents[0].parts[0].text) as {id:string;text:string}[];
    submitted.push(...input.map(i=>i.text));
    await route.fulfill({headers,json:{candidates:[{content:{parts:[{text:JSON.stringify(input)}]}}]}});
  });
  await page.getByLabel('Translation provider',{exact:true}).selectOption('gemini');
  await openDrawing(page,'Mechanical_Plan.dwg');
  for(const id of ['txt-001','txt-004','txt-020'])await page.locator('[data-object-id="'+id+'"]').click();
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await run(page);
  expect(submitted).toEqual(['INSTALL AHU-01 ABOVE CEILING','RETURN AIR DUCT']);
  await expect(page.locator('[data-report-object-id="txt-020"]')).toHaveAttribute('data-report-status','Skipped');
  await expect(page.locator('[data-report-object-id="txt-020"]')).toContainText('Drawing reference / short code excluded automatically');
  await expect(page.locator('[data-report-object-id="txt-004"]')).toContainText('MT API returned the submitted text unchanged');
  await expect(page.locator('.report tbody tr[data-report-status="Skipped"]')).toHaveCount(3);
  await expect(page.locator('.stat-skipped strong')).toHaveText('3');
  await page.locator('.report-tabs').getByRole('button',{name:/Skipped/}).click();
  await expect(page.locator('.report tbody tr')).toHaveCount(3);
  await locate(page,'txt-004','Mechanical_Plan_FR.dwg');
  await expect(page.locator('.navigator-text')).toContainText('Retained text · English');
  await expect(page.locator('[data-object-id="txt-004"]')).toHaveAttribute('data-language','en');
});
test('laptop, presentation and narrow layouts expose the compact dialog and expanded canvas', async ({ page }, info) => {
  for(const size of [{width:1280,height:800},{width:1920,height:1080},{width:650,height:850}]){
    await page.setViewportSize(size);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    if(size.width===1280)await page.screenshot({path:info.outputPath('home-laptop.png'),fullPage:true});
  }
  await page.setViewportSize({width:1280,height:800});
  await openDrawing(page,'Level_01.dwg');
  await expect(page.getByRole('button',{name:'Translate All',exact:true})).toBeVisible();
  expect((await page.locator('.canvas-wrapper').boundingBox())!.width).toBeGreaterThan(1150);
  await page.screenshot({path:info.outputPath('drawing-laptop.png')});
  await page.getByRole('button',{name:'Translate All',exact:true}).click();
  await page.screenshot({path:info.outputPath('dialog-laptop.png')});
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.setViewportSize({width:1920,height:1080});
  await page.screenshot({path:info.outputPath('drawing-presentation.png')});
  await page.setViewportSize({width:650,height:850});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page.getByTestId('drawing-language')).toBeVisible();
  await page.screenshot({path:info.outputPath('drawing-narrow.png')});
});

test('keyboard editing keeps focus while typing, and compact dialog traps focus and supports Escape',async({page})=>{
  await openDrawing(page,'Level_01.dwg');
  const object=page.locator('[data-object-id="txt-001"]');
  await object.focus(); await page.keyboard.press('Enter');
  await expect(object).toHaveAttribute('aria-pressed','true');
  await page.keyboard.press('F2');
  const field=page.getByLabel('Drawing text',{exact:true});
  await field.focus(); await field.press('End'); await field.pressSequentially(' EDIT');
  await expect(field).toBeFocused(); await expect(field).toHaveValue('FIRE PUMP ROOM EDIT');
  await page.getByRole('button',{name:'Save text',exact:true}).click();
  await expect(object).toHaveAttribute('data-display-text','FIRE PUMP ROOM EDIT');
  const trigger=page.getByRole('button',{name:'Translate All',exact:true});
  await trigger.click();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button',{name:'Close dialog',exact:true})).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('dialog').getByRole('button',{name:'Translate',exact:true})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('target selection updates submission counts, requires a language, and switches multi-target output to copies',async({page})=>{
  await page.getByRole('button',{name:'Try Locate demo',exact:true}).click();
  await expect(page.getByTestId('mt-preview-total')).toHaveText('3');
  await page.getByRole('radio',{name:/Translate original file/}).check();
  await selectLanguage(page,'German');
  await expect(page.getByTestId('mt-preview-total')).toHaveText('6');
  for(const target of ['fr','de'])await expect(page.locator('[data-preview-target="'+target+'"] strong')).toHaveText('3');
  await expect(page.getByRole('radio',{name:/Translate original file/})).toBeDisabled();
  await expect(page.getByRole('radio',{name:/Create translated copies/})).toBeChecked();
  await page.getByRole('button',{name:'Remove French',exact:true}).click();
  await expect(page.getByRole('radio',{name:/Translate original file/})).toBeEnabled();
  await expect(page.getByTestId('mt-preview-total')).toHaveText('3');
  await page.getByRole('button',{name:'Remove German',exact:true}).click();
  await expect(page.getByTestId('mt-preview-total')).toHaveText('0');
  await expect(page.getByRole('dialog').getByRole('button',{name:'Translate',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('cad-translate-studio-v2')!).jobs.length)).toBe(0);
});
test('one multi-language job creates three independent copies with correct progress, report rows and Locate references',async({page},info)=>{
  await page.getByRole('button',{name:'Try Locate demo',exact:true}).click();
  await selectLanguage(page,'German');
  await selectLanguage(page,'Chinese (Simplified)');
  await expect(page.getByTestId('mt-preview-total')).toHaveText('9');
  await page.screenshot({path:info.outputPath('multiple-target-dialog.png')});
  await page.getByRole('dialog').getByRole('button',{name:'Translate',exact:true}).click();
  await expect(page.locator('.progress-files>div')).toHaveCount(3);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax','15');
  await expect(page.getByRole('heading',{name:'Translation complete',exact:true})).toBeVisible({timeout:30000});
  await expect(page.locator('.report tbody tr')).toHaveCount(15);
  await expect(page.locator('.report-heading')).toContainText('French, German, Chinese (Simplified)');
  const translatedInstances=await page.locator('.report tbody tr[data-report-status="Translated"]').count();
  const translated={fr:'LOCAL DES POMPES INCENDIE',de:'FEUERLÖSCHPUMPENRAUM',zh:'消防泵房'};
  for(const [target,text] of Object.entries(translated)){
    if(await page.locator('.locate-navigator').count())await backToReport(page);
    await expect(page.locator('[data-report-target="'+target+'"]')).toHaveCount(5);
    const name='Locate_Demo_'+target.toUpperCase()+'.dwg';
    await locate(page,'locate-demo-translated',name);
    await expect(page.locator('[data-object-id="locate-demo-translated"]')).toHaveAttribute('data-display-text',text);
    await expect(page.locator('.instance-bar')).toHaveAttribute('data-active-target',target);
    await expect(page.locator('.instance-bar')).toContainText(translatedInstances+' translated instances across 3 drawings');
  }
  await page.screenshot({path:info.outputPath('multiple-target-located.png')});
  await page.reload();
  for(const name of ['Locate_Demo.dwg','Locate_Demo_FR.dwg','Locate_Demo_DE.dwg','Locate_Demo_ZH.dwg'])await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('cad-translate-studio-v2')!));
  expect(stored.jobs).toHaveLength(1); expect(stored.jobs[0].processed).toBe(15);
  expect(stored.jobs[0].files.every((f:{processed:number;total:number})=>f.processed===f.total)).toBe(true);
  expect(stored.drawings.find((d:{id:string})=>d.id==='locate-demo').objects.every((o:{text:string;language:string})=>o.text==='FIRE PUMP ROOM'&&o.language==='en')).toBe(true);
});
test('Gemini setup makes no requests before Translate and sends current text for each language',async({page})=>{
  const submissions:{text:string;language:string}[]=[];
  await page.route('https://generativelanguage.googleapis.com/**',async route=>{
    const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type,x-goog-api-key'};
    if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
    const body=JSON.parse(route.request().postData()!);
    const input=JSON.parse(body.contents[0].parts[0].text) as {id:string;text:string}[];
    const language=body.systemInstruction.parts[0].text.includes('English to French')?'fr':'de';
    submissions.push(...input.map(i=>({text:i.text,language})));
    await route.fulfill({headers,json:{candidates:[{content:{parts:[{text:JSON.stringify(input.map(i=>({id:i.id,text:language.toUpperCase()+': '+i.text})))}]}}]}});
  });
  await page.getByLabel('Translation provider',{exact:true}).selectOption('gemini');
  await openDrawing(page,'Mechanical_Plan.dwg');
  for(const id of ['txt-001','txt-002','txt-003'])await page.locator('[data-object-id="'+id+'"]').click();
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await selectLanguage(page,'German');
  await expect(page.getByTestId('mt-preview-total')).toHaveText('6');
  const expectedSubmissions=Number(await page.getByTestId('mt-preview-total').textContent());
  expect(submissions).toHaveLength(0);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  expect(submissions).toHaveLength(0);
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await selectLanguage(page,'German');
  await run(page);
  expect(submissions).toHaveLength(expectedSubmissions);
  const source=['INSTALL AHU-01 ABOVE CEILING','CONNECT DN100 TO HVAC SYSTEM','INSTALL EXHAUST FAN ABOVE CEILING'];
  for(const target of ['fr','de'])expect(submissions.filter(i=>i.language===target).map(i=>i.text)).toEqual(source);
  await expect(page.locator('.report tbody tr')).toHaveCount(6);
  for(const target of ['fr','de']){
    await locate(page,'txt-001','Mechanical_Plan_'+target.toUpperCase()+'.dwg');
    await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text',target.toUpperCase()+': '+source[0]);
  }
});
test('batch translation previews counts and reports every output independently',async({page})=>{
  await page.getByRole('button',{name:'Translate Drawings',exact:true}).click();
  for(const name of ['Level_01.dwg','Site_Plan.dwg'])await page.getByRole('checkbox',{name:'Select '+name,exact:true}).check();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await expect(page.getByTestId('mt-preview-total')).toHaveText('30');
  await selectLanguage(page,'German');
  await expect(page.getByTestId('mt-preview-total')).toHaveText('60');
  await page.getByRole('dialog').getByRole('button',{name:'Translate',exact:true}).click();
  await expect(page.locator('.progress-files>div')).toHaveCount(4);
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuemax','104');
  await expect(page.getByRole('heading',{name:'Translation complete',exact:true})).toBeVisible({timeout:30000});
  await expect(page.locator('.report tbody tr')).toHaveCount(104);
  await expect(page.locator('.batch-summary>div')).toHaveCount(4);
  await page.getByLabel('Filter report by drawing',{exact:true}).selectOption({label:'Site_Plan_DE.dwg'});
  await expect(page.locator('.report tbody tr')).toHaveCount(26);
  await expect(page.locator('.report tbody tr').first()).toHaveAttribute('data-report-target','de');
  await locate(page,'txt-001','Site_Plan_DE.dwg');
  await expect(page.getByTestId('drawing-language')).toContainText('German');
});
test('mixed-language input counts same-target text and resubmits it for every requested language',async({page})=>{
  await openDrawing(page,'Level_01.dwg');
  await page.locator('[data-object-id="txt-001"]').click();
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await run(page,true);
  await locate(page,'txt-001','Level_01.dwg');
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await expect(page.getByTestId('mt-preview-total')).toHaveText('1');
  await selectLanguage(page,'German');
  await expect(page.getByTestId('mt-preview-total')).toHaveText('2');
  for(const target of ['fr','de'])await expect(page.locator('[data-preview-target="'+target+'"] strong')).toHaveText('1');
  await run(page);
  await expect(page.locator('[data-report-target="fr"]')).toHaveAttribute('data-report-status','Skipped');
  await expect(page.locator('[data-report-target="fr"]')).toContainText('Offline MT simulation returned the submitted text unchanged');
  await locate(page,'txt-001','Level_01_DE.dwg');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text','FEUERLÖSCHPUMPENRAUM');
});

test('global language dropdown searches native names and codes, keeps selected chips, and supports keyboard selection',async({page},info)=>{
  await page.getByRole('button',{name:'Try Locate demo',exact:true}).click();
  const trigger=page.getByRole('combobox',{name:'Target languages',exact:true});
  await trigger.focus(); await page.keyboard.press('ArrowDown');
  const search=page.getByRole('searchbox',{name:'Search languages',exact:true});
  await expect(search).toBeFocused();
  await search.pressSequentially('espanol');
  await expect(search).toBeFocused();
  await expect(page.getByRole('option',{name:'Spanish',exact:true})).toBeVisible();
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('Space');
  await expect(page.getByRole('option',{name:'Spanish',exact:true})).toHaveAttribute('aria-selected','true');
  await expect(page.locator('[data-selected-language="es"]')).toBeVisible();
  await search.fill('ja');
  await expect(page.getByRole('listbox',{name:'Languages',exact:true}).getByRole('option').first()).toHaveAttribute('aria-label','Japanese');
  await page.getByRole('option',{name:'Japanese',exact:true}).click();
  await search.fill('Chinese Traditional');
  await page.getByRole('option',{name:'Chinese (Traditional)',exact:true}).click();
  await search.fill('Uab Meto');
  await expect(page.getByRole('option',{name:'Uab Meto',exact:true})).toBeVisible();
  await search.fill('zzzz-no-language');
  await expect(page.getByText('No languages match your search.',{exact:true})).toBeVisible();
  await expect(page.locator('[data-selected-language]')).toHaveCount(4);
  await search.fill('العربية');
  await page.screenshot({path:info.outputPath('global-language-search.png')});
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded','false');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(trigger).toBeFocused();
  await expect(page.locator('.offline-language-note')).toContainText('require Gemini');
  await page.getByRole('button',{name:'Remove Spanish',exact:true}).click();
  await expect(page.locator('[data-selected-language="es"]')).toHaveCount(0);
  await trigger.click(); await search.fill('Japanese');
  await expect(page.getByRole('option',{name:'Japanese',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('option',{name:'Japanese',exact:true}).click();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await expect(page.locator('[data-selected-language="ja"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
});
test('filename search preserves hidden selections and translates only the selected files',async({page},info)=>{
  await page.getByRole('button',{name:'Translate Drawings',exact:true}).click();
  const search=page.getByRole('searchbox',{name:'Search files',exact:true});
  await search.pressSequentially('MECHANICAL');
  await expect(search).toBeFocused();
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await page.getByRole('checkbox',{name:'Select Mechanical_Plan.dwg',exact:true}).check();
  await search.fill('site plan');
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await page.getByRole('checkbox',{name:'Select Site_Plan.dwg',exact:true}).check();
  await expect(page.locator('.batch-selection-summary')).toContainText('2 files selected');
  await page.screenshot({path:info.outputPath('file-search-selected.png')});
  await search.fill('no-such-file');
  await expect(page.getByText('No files match your search.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Continue',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Clear file search',exact:true}).click();
  await expect(page.getByRole('checkbox')).toHaveCount(5);
  await expect(page.getByRole('checkbox',{name:'Select Mechanical_Plan.dwg',exact:true})).toBeChecked();
  await expect(page.getByRole('checkbox',{name:'Select Site_Plan.dwg',exact:true})).toBeChecked();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Drawings',exact:true}).click();
  await expect(page.getByRole('checkbox',{name:'Select Site_Plan.dwg',exact:true})).toBeChecked();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await run(page);
  await expect(page.locator('.batch-summary>div')).toHaveCount(2);
  await expect(page.locator('.report tbody tr')).toHaveCount(52);
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('cad-translate-studio-v2')!));
  expect(stored.jobs[0].files.map((f:{sourceId:string})=>f.sourceId)).toEqual(['mechanical','site']);
});
test('global targets use Gemini and create persistent language-specific copies with correct Locate references',async({page})=>{
  const translations:{[language:string]:string}={Spanish:'SALA DE BOMBAS DE INCENDIO',Japanese:'消防ポンプ室',Arabic:'غرفة مضخة الحريق'};
  const calls:string[]=[];
  await page.route('https://generativelanguage.googleapis.com/**',async route=>{
    const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type,x-goog-api-key'};
    if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
    const body=JSON.parse(route.request().postData()!);
    const input=JSON.parse(body.contents[0].parts[0].text) as {id:string;text:string}[];
    const language=Object.keys(translations).find(name=>body.systemInstruction.parts[0].text.includes('English to '+name+'.'))!;
    expect(input.map(item=>item.text)).toEqual(['FIRE PUMP ROOM']);
    calls.push(language);
    await route.fulfill({headers,json:{candidates:[{content:{parts:[{text:JSON.stringify(input.map(item=>({id:item.id,text:translations[language]})))}]}}]}});
  });
  await page.getByLabel('Translation provider',{exact:true}).selectOption('gemini');
  await openDrawing(page,'Level_01.dwg');
  await page.locator('[data-object-id="txt-001"]').click();
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await page.getByRole('button',{name:'Remove French',exact:true}).click();
  for(const language of Object.keys(translations))await selectLanguage(page,language);
  expect(calls).toHaveLength(0);
  await run(page);
  expect(calls).toEqual(['Spanish','Japanese','Arabic']);
  for(const [code,language] of [['es','Spanish'],['ja','Japanese'],['ar','Arabic']]){
    await locate(page,'txt-001','Level_01_'+code.toUpperCase()+'.dwg');
    await expect(page.getByTestId('drawing-language')).toContainText(language);
    await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text',translations[language]);
  }
  await page.reload();
  await expect(page.locator('.drawing-card')).toHaveCount(8);
  await expect(page.locator('.sidebar-language').filter({hasText:'Spanish'})).toBeVisible();
  await openDrawing(page,'Level_01_ES.dwg');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text',translations.Spanish);
});
test('English is selectable as a target for a translated input',async({page})=>{
  await openDrawing(page,'Level_01.dwg');
  await page.locator('[data-object-id="txt-001"]').click();
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await run(page,true);
  await locate(page,'txt-001','Level_01.dwg');
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await page.getByRole('button',{name:'Remove French',exact:true}).click();
  await selectLanguage(page,'English');
  await run(page);
  await locate(page,'txt-001','Level_01_EN.dwg');
  await expect(page.getByTestId('drawing-language')).toContainText('English');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text','FIRE PUMP ROOM');
});
test('search dropdown and selected chips fit a laptop and narrow dialog',async({page},info)=>{
  await page.setViewportSize({width:1280,height:800});
  await page.getByRole('button',{name:'Try Locate demo',exact:true}).click();
  await selectLanguage(page,'Spanish'); await selectLanguage(page,'Japanese'); await selectLanguage(page,'Chinese (Traditional)');
  await page.screenshot({path:info.outputPath('language-chips-laptop.png')});
  await page.getByRole('combobox',{name:'Target languages',exact:true}).click();
  await page.getByRole('searchbox',{name:'Search languages',exact:true}).fill('span');
  await expect(page.getByRole('option',{name:'Spanish',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('language-dropdown-laptop.png')});
  await page.setViewportSize({width:650,height:850});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page.getByRole('searchbox',{name:'Search languages',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Done',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('language-dropdown-narrow.png')});
});

test('Home reports Locate opens a compact navigator and restores the same report filters',async({page},info)=>{
  await page.setViewportSize({width:1280,height:800});
  await openDrawing(page,'Level_01.dwg');
  await expect(page.locator('.drawing-ribbon').getByRole('button',{name:'Report',exact:true})).toHaveCount(0);
  await expect(page.locator('.locate-navigator')).toHaveCount(0);
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.getByRole('button',{name:'Try Locate demo',exact:true}).click();
  await run(page);
  const jobId=await page.locator('.report').getAttribute('data-report-job-id');
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await openDrawing(page,'Locate_Demo_FR.dwg');
  await expect(page.locator('.drawing-ribbon').getByRole('button',{name:'Report',exact:true})).toHaveCount(0);
  await expect(page.locator('.locate-navigator')).toHaveCount(0);
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.getByRole('button',{name:/Translation reports/}).click();
  await page.locator('.report-tabs').getByRole('button',{name:/Warnings/}).click();
  await page.getByLabel('Filter report by drawing',{exact:true}).selectOption({label:'Locate_Demo_FR.dwg'});
  const drawingFilter=await page.getByLabel('Filter report by drawing',{exact:true}).inputValue();
  await page.getByLabel('Search report',{exact:true}).fill('FIRE PUMP ROOM');
  await locate(page,'locate-demo-overflow','Locate_Demo_FR.dwg');
  await expect(page.locator('.navigator-text strong')).toHaveText('LOCAL DES POMPES INCENDIE');
  await expect(page.locator('.navigator-reason')).toContainText('may exceed original text bounds');
  expect((await page.locator('.locate-navigator').boundingBox())!.height).toBeLessThan(180);
  expect((await page.locator('.canvas-wrapper').boundingBox())!.height).toBeGreaterThan(440);
  await page.screenshot({path:info.outputPath('compact-locate-laptop.png')});
  await expect(page.locator('.instance-navigation').getByRole('button',{name:'Next',exact:true})).toBeDisabled();
  await expect(page.locator('.instance-navigation').getByRole('button',{name:'Previous',exact:true})).toBeDisabled();
  await expect(page.locator('.locate-navigator')).toHaveAttribute('data-active-status','Warning');
  await backToReport(page);
  await expect(page.locator('.report')).toHaveAttribute('data-report-job-id',jobId!);
  await expect(page.getByLabel('Translation job',{exact:true})).toHaveValue(jobId!);
  await expect(page.locator('.report-tabs').getByRole('button',{name:/Warnings/})).toHaveClass('active');
  await expect(page.getByLabel('Filter report by drawing',{exact:true})).toHaveValue(drawingFilter);
  await expect(page.getByLabel('Search report',{exact:true})).toHaveValue('FIRE PUMP ROOM');
  await expect(page.locator('.report tbody tr')).toHaveCount(1);
});
test('Back to report returns to an older selected job and each job keeps its own view',async({page})=>{
  await page.getByRole('button',{name:'Try Locate demo',exact:true}).click();
  await run(page);
  const olderId=await page.locator('.report').getAttribute('data-report-job-id');
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.getByRole('button',{name:'Try Locate demo',exact:true}).click();
  await selectLanguage(page,'German');
  await page.getByRole('button',{name:'Remove French',exact:true}).click();
  await run(page);
  const latestId=await page.locator('.report').getAttribute('data-report-job-id');
  await page.getByLabel('Filter report by drawing',{exact:true}).selectOption({label:'Locate_Demo_DE.dwg'});
  const latestDrawing=await page.getByLabel('Filter report by drawing',{exact:true}).inputValue();
  await page.locator('.report-tabs').getByRole('button',{name:/Skipped/}).click();
  await page.getByLabel('Search report',{exact:true}).fill('FIRE PUMP ROOM');
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await page.getByRole('button',{name:/Translation reports/}).click();
  await page.getByLabel('Translation job',{exact:true}).selectOption(olderId!);
  await page.locator('.report-tabs').getByRole('button',{name:/Warnings/}).click();
  await page.getByLabel('Filter report by drawing',{exact:true}).selectOption({label:'Locate_Demo_FR.dwg'});
  await page.getByLabel('Search report',{exact:true}).fill('FIRE PUMP ROOM');
  await locate(page,'locate-demo-overflow','Locate_Demo_FR.dwg');
  await expect(page.locator('.locate-navigator')).toHaveAttribute('data-active-job-id',olderId!);
  await expect(page.locator('.instance-navigation').getByRole('button',{name:'Next',exact:true})).toBeDisabled();
  await expect(page.locator('.ribbon-title')).toContainText('Locate_Demo_FR.dwg');
  await backToReport(page);
  await expect(page.getByLabel('Translation job',{exact:true})).toHaveValue(olderId!);
  await expect(page.locator('.report-tabs').getByRole('button',{name:/Warnings/})).toHaveClass('active');
  await page.getByLabel('Translation job',{exact:true}).selectOption(latestId!);
  await expect(page.locator('.report-tabs').getByRole('button',{name:/Skipped/})).toHaveClass('active');
  await expect(page.getByLabel('Filter report by drawing',{exact:true})).toHaveValue(latestDrawing);
  await expect(page.getByLabel('Search report',{exact:true})).toHaveValue('FIRE PUMP ROOM');
  await expect(page.locator('.report tbody tr')).toHaveCount(2);
});
test('returning to the report preserves scroll position and the navigator stays compact at presentation and narrow sizes',async({page},info)=>{
  await page.setViewportSize({width:1280,height:800});
  await openDrawing(page,'Site_Plan.dwg');
  await page.getByRole('button',{name:'Translate All',exact:true}).click();
  await run(page);
  await page.locator('.report-table').evaluate(element=>{element.scrollTop=element.scrollHeight;element.scrollLeft=element.scrollWidth;});
  await page.getByRole('button',{name:'Locate txt-025 in Site_Plan_FR.dwg',exact:true}).scrollIntoViewIfNeeded();
  const position=await page.locator('.report-table').evaluate(element=>({top:element.scrollTop,left:element.scrollLeft,page:window.scrollY}));
  expect(position.top).toBeGreaterThan(0);
  await locate(page,'txt-025','Site_Plan_FR.dwg');
  await backToReport(page);
  await expect.poll(()=>page.locator('.report-table').evaluate(element=>element.scrollTop)).toBe(position.top);
  await expect.poll(()=>page.locator('.report-table').evaluate(element=>element.scrollLeft)).toBe(position.left);
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(position.page);
  await locate(page,'txt-025','Site_Plan_FR.dwg');
  for(const viewport of [{width:1920,height:1080},{width:650,height:850}]){
    await page.setViewportSize(viewport);
    await expect(page.getByRole('button',{name:'Back to report',exact:true})).toBeVisible();
    await expect(page.locator('.navigator-reason')).toBeVisible();
    await expect(page.locator('.report-table')).toHaveCount(0);
    expect((await page.locator('.locate-navigator').boundingBox())!.height).toBeLessThan(200);
    expect((await page.locator('.canvas-wrapper').boundingBox())!.height).toBeGreaterThan(viewport.height*.5);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('compact-locate-'+viewport.width+'.png')});
  }
});

test('saved Unchanged results merge into Skipped after reload and keep Locate references',async({page})=>{
  await page.getByRole('button',{name:'Try Locate demo',exact:true}).click();
  await run(page);
  const jobId=await page.locator('.report').getAttribute('data-report-job-id');
  await page.evaluate(()=>{
    const key='cad-translate-studio-v2';
    const state=JSON.parse(localStorage.getItem(key)!);
    const row=state.jobs[0].rows.find((item:{objectId:string})=>item.objectId==='locate-demo-unchanged');
    row.status='Unchanged';
    const output=state.drawings.find((drawing:{id:string})=>drawing.id===row.outputDrawingId);
    const object=output.objects.find((item:{id:string})=>item.id===row.objectId);
    object.lastStatus='Unchanged';
    object.text='MANUAL SAVED LABEL';
    localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole('button',{name:/Translation reports/}).click();
  await expect(page.locator('.report')).toHaveAttribute('data-report-job-id',jobId!);
  await expect(page.locator('.report-tabs').getByRole('button',{name:/Unchanged/})).toHaveCount(0);
  await page.locator('.report-tabs').getByRole('button',{name:/Skipped/}).click();
  await expect(page.locator('.report tbody tr')).toHaveCount(2);
  await expect(page.locator('[data-report-object-id="locate-demo-unchanged"]')).toContainText('Offline MT simulation returned the submitted text unchanged');
  await locate(page,'locate-demo-unchanged','Locate_Demo_FR.dwg');
  await expect(page.locator('.locate-navigator')).toHaveAttribute('data-active-status','Skipped');
  await expect(page.locator('[data-object-id="locate-demo-unchanged"]')).toHaveAttribute('data-display-text','MANUAL SAVED LABEL');
  await expect(page.locator('.navigator-text strong')).toHaveText('FIRE PUMP ROOM');
  await backToReport(page);
  await expect(page.locator('.report-tabs').getByRole('button',{name:/Skipped/})).toHaveClass('active');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('cad-translate-studio-v2')!));
  expect(stored.jobs[0].rows.every((row:{status:string})=>row.status!=='Unchanged')).toBe(true);
  expect(stored.drawings.every((drawing:{objects:{lastStatus?:string}[]})=>drawing.objects.every(object=>object.lastStatus!=='Unchanged'))).toBe(true);
});

test('Gemini resubmits saved target-language text after reload and preview matches both requests',async({page},info)=>{
  const submissions:{text:string;prompt:string}[]=[];
  await page.route('https://generativelanguage.googleapis.com/**',async route=>{
    const headers={'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type,x-goog-api-key'};
    if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers});return;}
    const body=JSON.parse(route.request().postData()!);
    const input=JSON.parse(body.contents[0].parts[0].text) as {id:string;text:string}[];
    submissions.push(...input.map(item=>({text:item.text,prompt:body.systemInstruction.parts[0].text})));
    await route.fulfill({headers,json:{candidates:[{content:{parts:[{text:JSON.stringify(input.map(item=>({id:item.id,text:submissions.length===1?'LOCAL DES POMPES INCENDIE':item.text})))}]}}]}});
  });
  await page.getByLabel('Translation provider',{exact:true}).selectOption('gemini');
  await openDrawing(page,'Level_01.dwg');
  await page.locator('[data-object-id="txt-001"]').click();
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await expect(page.getByTestId('mt-preview-total')).toHaveText('1');
  expect(submissions).toHaveLength(0);
  await run(page,true);
  expect(submissions).toHaveLength(1);
  await page.reload();
  await page.getByLabel('Translation provider',{exact:true}).selectOption('gemini');
  await openDrawing(page,'Level_01.dwg');
  await expect(page.getByTestId('drawing-language')).toContainText('French');
  await page.locator('[data-object-id="txt-001"]').click();
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await expect(page.getByTestId('mt-preview-total')).toHaveText('1');
  expect(submissions).toHaveLength(1);
  await page.setViewportSize({width:1280,height:800});
  await page.screenshot({path:info.outputPath('repeat-translation-preview.png')});
  await run(page,true);
  expect(submissions).toHaveLength(2);
  expect(submissions[0].text).toBe('FIRE PUMP ROOM');
  expect(submissions[1].text).toBe('LOCAL DES POMPES INCENDIE');
  expect(submissions[1].prompt).toContain('French to French');
  await expect(page.locator('.report tbody tr')).toHaveAttribute('data-report-status','Skipped');
  await expect(page.locator('.report')).toContainText('MT API returned the submitted text unchanged');
  await expect(page.locator('.report')).not.toContainText('Already in target language');
  const state=await page.evaluate(()=>JSON.parse(localStorage.getItem('cad-translate-studio-v2')!));
  expect(state.jobs).toHaveLength(2);
  expect(state.jobs[0].rows[0].original).toBe('LOCAL DES POMPES INCENDIE');
  expect(state.jobs[1].rows[0].original).toBe('FIRE PUMP ROOM');
  expect(state.drawings[0].objects[0].text).toBe('LOCAL DES POMPES INCENDIE');
});

test('identical text and object IDs in different outputs retain distinct outcomes and Locate references after reload',async({page},info)=>{
  await page.evaluate(()=>{
    const key='cad-translate-studio-v2', state=JSON.parse(localStorage.getItem(key)!);
    state.drawings=state.drawings.map((drawing:{id:string;objects:Record<string,unknown>[]})=>['level-01','site'].includes(drawing.id)?{
      ...drawing,objects:[{...drawing.objects[0],text:'FIRE PUMP ROOM',width:drawing.id==='site'?60:400}],
    }:drawing);
    localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload();
  await page.getByLabel('Translation provider',{exact:true}).selectOption('demo');
  await page.getByRole('button',{name:'Translate Drawings',exact:true}).click();
  for(const name of ['Level_01.dwg','Site_Plan.dwg'])await page.getByRole('checkbox',{name:'Select '+name,exact:true}).check();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await selectLanguage(page,'German');
  await expect(page.getByTestId('mt-preview-total')).toHaveText('4');
  await run(page);
  await page.reload();
  await page.getByRole('button',{name:/Translation reports/}).click();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('cad-translate-studio-v2')!));
  const records=saved.jobs[0].rows as {objectId:string;drawingName:string;sourceDrawingId:string;outputDrawingId:string;target:string;status:string;reason:string}[];
  expect(records).toHaveLength(4);
  expect(records.map(row=>row.status)).toEqual(['Translated','Warning','Translated','Warning']);
  expect(new Set(records.map(row=>row.objectId))).toEqual(new Set(['txt-001']));
  await expect(page.locator('.report tbody tr')).toHaveCount(4);
  await expect(page.getByRole('columnheader',{name:'Instance',exact:true})).toBeVisible();
  const keys=await page.locator('.report tbody tr').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-report-instance-key')));
  expect(new Set(keys).size).toBe(4);
  for(const row of records){
    const rendered=page.locator('tr[data-report-output-drawing-id="'+row.outputDrawingId+'"]');
    await expect(rendered).toHaveAttribute('data-report-status',row.status);
    await expect(rendered.locator('.report-object-id')).toHaveText(row.objectId);
    await expect(rendered.locator('.report-before')).toHaveText('FIRE PUMP ROOM');
    await expect(rendered.locator('.reason-cell')).toHaveText(row.reason);
    if(row.status==='Translated')await expect(rendered.locator('.reason-cell')).not.toContainText('may exceed');
  }
  for(const viewport of [{width:1920,height:1080},{width:1280,height:800}]){
    await page.setViewportSize(viewport);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('per-instance-report-'+viewport.width+'.png'),fullPage:true});
  }
  for(const row of records){
    await locate(page,row.objectId,row.drawingName);
    await expect(page.locator('.locate-navigator')).toHaveAttribute('data-active-output-drawing-id',row.outputDrawingId);
    await expect(page.locator('.locate-navigator')).toHaveAttribute('data-active-target',row.target);
    await expect(page.locator('.locate-navigator')).toHaveAttribute('data-active-status',row.status);
    await expect(page.locator('.navigator-reason')).toHaveText(row.reason);
  }
  await backToReport(page);
  await page.locator('.report-tabs').getByRole('button',{name:/Warnings/}).click();
  await expect(page.locator('.report tbody tr')).toHaveCount(2);
  await locate(page,'txt-001','Site_Plan_FR.dwg');
  await page.locator('.instance-navigation').getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.locator('.ribbon-title')).toContainText('Site_Plan_DE.dwg');
  await expect(page.locator('.locate-navigator')).toHaveAttribute('data-active-status','Warning');
  await expect(page.locator('.navigator-reason')).toHaveText('Translated text may exceed original text bounds');
  await expect(page.locator('.instance-navigation').getByRole('button',{name:'Next',exact:true})).toBeDisabled();
  await page.locator('.instance-navigation').getByRole('button',{name:'Previous',exact:true}).click();
  await expect(page.locator('.ribbon-title')).toContainText('Site_Plan_FR.dwg');
  await expect(page.locator('.locate-navigator')).toHaveAttribute('data-active-status','Warning');
  await backToReport(page);
  await expect(page.locator('.report-tabs').getByRole('button',{name:/Warnings/})).toHaveClass('active');
  await expect(page.locator('.report tbody tr')).toHaveCount(2);
  await page.locator('.report-tabs').getByRole('button',{name:/^All/}).click();
  await locate(page,'txt-001','Level_01_FR.dwg');
  await expect(page.locator('.locate-navigator')).toContainText('2 translated instances across 2 drawings');
  await page.locator('.instance-navigation').getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.locator('.ribbon-title')).toContainText('Level_01_DE.dwg');
  await expect(page.locator('.locate-navigator')).toHaveAttribute('data-active-status','Translated');
  await expect(page.locator('.instance-navigation').getByRole('button',{name:'Next',exact:true})).toBeDisabled();

});

test('different-status language results have separate records and separate Locate navigation groups after reload',async({page},info)=>{
  await openDrawing(page,'Mechanical_Plan.dwg');
  await page.locator('[data-object-id="txt-003"]').click();
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await selectLanguage(page,'Chinese (Simplified)');
  await expect(page.getByTestId('mt-preview-total')).toHaveText('2');
  await run(page);
  await expect(page.locator('.report tbody tr')).toHaveCount(2);
  await expect(page.locator('[data-report-target="fr"]')).toHaveAttribute('data-report-status','Warning');
  await expect(page.locator('[data-report-target="zh"]')).toHaveAttribute('data-report-status','Translated');
  await expect(page.locator('[data-report-target="fr"] .report-instance-cell small')).toHaveText('1 warning instance');
  await expect(page.locator('[data-report-target="zh"] .report-instance-cell small')).toHaveText('1 translated instance');
  await expect(page.getByRole('button',{name:/View matching instances/})).toHaveCount(0);
  await page.evaluate(()=>{
    const key='cad-translate-studio-v2', state=JSON.parse(localStorage.getItem(key)!);
    const warning=state.jobs[0].rows.find((row:{target:string})=>row.target==='fr');
    warning.reason='Translated text may exceed original text bounds; Offline MT simulation translation stored successfully';
    const object=state.drawings.find((drawing:{id:string})=>drawing.id===warning.outputDrawingId).objects.find((item:{id:string})=>item.id===warning.objectId);
    object.lastReason=warning.reason;
    localStorage.setItem(key,JSON.stringify(state));
  });
  await page.reload();
  await page.getByRole('button',{name:/Translation reports/}).click();
  await page.locator('.report-tabs').getByRole('button',{name:/Warnings/}).click();
  await expect(page.locator('.report tbody tr')).toHaveCount(1);
  await expect(page.locator('.reason-cell')).toHaveText('Translated text may exceed original text bounds');
  await locate(page,'txt-003','Mechanical_Plan_FR.dwg');
  await expect(page.locator('.locate-navigator')).toHaveAttribute('data-active-status','Warning');
  await expect(page.locator('.locate-navigator')).toContainText('1 warning instance across 1 drawing');
  await expect(page.locator('.instance-navigation').getByRole('button',{name:'Previous',exact:true})).toBeDisabled();
  await expect(page.locator('.instance-navigation').getByRole('button',{name:'Next',exact:true})).toBeDisabled();
  for(const viewport of [{width:1280,height:800},{width:650,height:850}]){
    await page.setViewportSize(viewport);
    await expect(page.getByRole('button',{name:'Back to report',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:info.outputPath('same-status-navigation-'+viewport.width+'.png')});
  }
  await backToReport(page);
  await expect(page.locator('.report-tabs').getByRole('button',{name:/Warnings/})).toHaveClass('active');
  await expect(page.locator('.report tbody tr')).toHaveCount(1);
  await page.locator('.report-tabs').getByRole('button',{name:/^All/}).click();
  await expect(page.locator('.report tbody tr')).toHaveCount(2);
  await locate(page,'txt-003','Mechanical_Plan_ZH.dwg');
  await expect(page.locator('.locate-navigator')).toHaveAttribute('data-active-status','Translated');
  await expect(page.locator('.locate-navigator')).toHaveAttribute('data-active-target','zh');
  await expect(page.locator('.locate-navigator')).toContainText('1 translated instance across 1 drawing');
  await expect(page.locator('.instance-navigation').getByRole('button',{name:'Previous',exact:true})).toBeDisabled();
  await expect(page.locator('.instance-navigation').getByRole('button',{name:'Next',exact:true})).toBeDisabled();
  await expect(page.locator('.drawing-canvas [aria-pressed="true"]')).toHaveCount(1);
  await expect(page.locator('[data-object-id="txt-003"]')).toHaveAttribute('aria-pressed','true');
  const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('cad-translate-studio-v2')!));
  expect(stored.jobs[0].rows.map((row:{status:string})=>row.status)).toEqual(['Warning','Translated']);
  expect(stored.jobs[0].rows[0].reason).toBe('Translated text may exceed original text bounds');
});


test('overflow uses the visible text limits and remains dashed during selection and Locate', async ({ page }) => {
  const source = 'INSTALL AHU-01 ABOVE CEILING';
  const translated = '在吊顶上方安装 AHU-01';
  const limits = await page.evaluate(({ source, translated }) => {
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = '11px Arial';
    const width = context.measureText(translated).width;
    const limits = { outside: width - 2, inside: width + 2 };
    const key = 'cad-translate-studio-v2';
    const state = JSON.parse(localStorage.getItem(key)!);
    const drawing = state.drawings.find((item: { id: string }) => item.id === 'mechanical');
    for (const [index, limit] of [limits.outside, limits.inside].entries()) {
      Object.assign(drawing.objects[index], { text: source, language: 'en', type: 'MText', locked: false, fontSize: 11, width: limit, height: 30 });
    }
    localStorage.setItem(key, JSON.stringify(state));
    return limits;
  }, { source, translated });
  await page.reload();
  await page.getByLabel('Translation provider', { exact: true }).selectOption('demo');
  await openDrawing(page, 'Mechanical_Plan.dwg');
  for (const id of ['txt-001', 'txt-002']) await page.locator('[data-object-id="' + id + '"]').click();
  await page.getByRole('button', { name: /Translate Selection/ }).click();
  await page.getByRole('button', { name: 'Remove French', exact: true }).click();
  await selectLanguage(page, 'Chinese (Simplified)');
  await run(page);
  await expect(page.locator('[data-report-object-id="txt-001"]')).toHaveAttribute('data-report-status', 'Warning');
  await expect(page.locator('[data-report-object-id="txt-002"]')).toHaveAttribute('data-report-status', 'Translated');

  await locate(page, 'txt-001', 'Mechanical_Plan_ZH.dwg');
  const object = page.locator('[data-object-id="txt-001"]');
  const dimensions = await object.evaluate(element => {
    const bounds = element.querySelector<SVGRectElement>('.text-bounds')!;
    const text = element.querySelector<SVGTextElement>('text')!;
    const rendered = text.getBBox();
    const style = getComputedStyle(bounds);
    return { x: bounds.x.baseVal.value, y: bounds.y.baseVal.value, width: bounds.width.baseVal.value, height: bounds.height.baseVal.value, right: rendered.x + rendered.width, stroke: style.stroke, dash: style.strokeDasharray };
  });
  expect(dimensions.x).toBe(0);
  expect(dimensions.y).toBe(-11);
  expect(dimensions.width).toBeCloseTo(limits.outside, 3);
  expect(dimensions.height).toBe(30);
  // This overrun fitted inside the old selection padding, hiding the warning.
  expect(dimensions.right - dimensions.width).toBeGreaterThan(0);
  expect(dimensions.right - dimensions.width).toBeLessThan(5);
  expect(dimensions.stroke).toBe('rgb(210, 168, 91)');
  expect(dimensions.dash).not.toBe('none');

  await locate(page, 'txt-002', 'Mechanical_Plan_ZH.dwg');
  const fitting = page.locator('[data-object-id="txt-002"]');
  await expect(fitting).not.toHaveClass(/overflow/);
  const fits = await fitting.evaluate(element => {
    const bounds = element.querySelector<SVGRectElement>('.text-bounds')!;
    const rendered = element.querySelector<SVGTextElement>('text')!.getBBox();
    return rendered.x + rendered.width <= bounds.x.baseVal.value + bounds.width.baseVal.value;
  });
  expect(fits).toBe(true);

  await locate(page, 'txt-001', 'Mechanical_Plan_ZH.dwg');
  await object.dblclick();
  await page.getByLabel('Drawing text', { exact: true }).fill('短标注');
  await page.getByRole('button', { name: /Save text/ }).click();
  await expect(object).not.toHaveClass(/overflow/);
  await expect(object).toHaveAttribute('data-display-text', '短标注');
  await backToReport(page);
  await expect(page.locator('[data-report-object-id="txt-001"]')).toHaveAttribute('data-report-status', 'Warning');
  await expect(page.locator('[data-report-object-id="txt-001"] .translation-cell')).toHaveText(translated);
});
