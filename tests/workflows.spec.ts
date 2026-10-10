import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.use({ viewport: { width:1440, height:1000 } });
test.beforeEach(async({page})=>{
  await page.goto('/');
  await page.getByLabel('Translation provider',{exact:true}).selectOption('demo');
});
async function openDrawing(page:Page,name:string){
  await page.locator('.drawing-card').filter({has:page.getByRole('heading',{name,exact:true})}).getByRole('button',{name:'Open drawing',exact:true}).click();
  await expect(page.getByLabel('Display language',{exact:true})).toBeVisible();
}
async function reviewAndRun(page:Page,copy=false){
  await page.getByRole('button',{name:'Review preview',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Ready to translate to French',exact:true})).toBeVisible();
  if(copy)await page.getByRole('radio',{name:/Create translated/}).check();
  await page.getByRole('button',{name:'Start translation',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Translation complete',exact:true})).toBeVisible({timeout:30000});
}
test('single drawing: preview, progress, warnings, locate and bilingual display',async({page},info)=>{
  await page.screenshot({path:info.outputPath('home.png'),fullPage:true});
  await openDrawing(page,'Level_01.dwg');
  await page.screenshot({path:info.outputPath('drawing-source.png')});
  await page.getByRole('button',{name:'Translate All',exact:true}).click();
  await page.getByRole('button',{name:'Review preview',exact:true}).click();
  await page.getByRole('button',{name:/View Excluded Items/}).click();
  await expect(page.locator('.preview-table')).toContainText('Object is on a locked layer');
  await page.screenshot({path:info.outputPath('preview.png')});
  await page.getByRole('button',{name:'Start translation',exact:true}).click();
  await expect(page.getByRole('progressbar',{name:'Translation progress'})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Translation complete',exact:true})).toBeVisible();
  await page.locator('.report-tabs').getByRole('button',{name:/Warnings/}).click();
  await expect(page.locator('.report tbody tr')).not.toHaveCount(0);
  await page.screenshot({path:info.outputPath('warnings-report.png')});
  await page.getByRole('button',{name:'Locate FIRE PUMP ROOM in Level_01.dwg',exact:true}).first().click();
  await expect(page.getByLabel('Display language',{exact:true})).toHaveValue('fr');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text','LOCAL DES POMPES INCENDIE');
  await page.getByLabel('Display language',{exact:true}).selectOption('en');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text','FIRE PUMP ROOM');
  await page.getByLabel('Display language',{exact:true}).selectOption('fr');
  await page.getByLabel('Display mode',{exact:true}).selectOption('bilingual');
  await expect(page.locator('[data-object-id="txt-001"]')).toContainText('FIRE PUMP ROOM');
  await expect(page.locator('[data-object-id="txt-001"]')).toContainText('LOCAL DES POMPES INCENDIE');
  await page.screenshot({path:info.outputPath('located-bilingual.png')});
});
test('selection: exactly three annotations translated and the others use source fallback',async({page})=>{
  await openDrawing(page,'Mechanical_Plan.dwg');
  for(const id of ['txt-001','txt-002','txt-003'])await page.locator('[data-object-id="'+id+'"]').click();
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await expect(page.getByText('3 selected objects · Source language: English')).toBeVisible();
  await reviewAndRun(page);
  await expect(page.locator('.report tbody tr')).toHaveCount(3);
  await page.getByRole('button',{name:/Locate INSTALL AHU-01 ABOVE CEILING/}).click();
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text','INSTALLER AHU-01 AU-DESSUS DU PLAFOND');
  await expect(page.locator('[data-object-id="txt-004"]')).toHaveAttribute('data-missing','true');
});
test('separate copy: original remains untranslated and both files appear on Home',async({page})=>{
  await openDrawing(page,'Site_Plan.dwg');
  await page.getByRole('button',{name:'Translate All',exact:true}).click();
  await reviewAndRun(page,true);
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Site_Plan_FR.dwg',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'Site_Plan.dwg',exact:true})).toBeVisible();
  await openDrawing(page,'Site_Plan.dwg');
  await page.getByLabel('Display language',{exact:true}).selectOption('fr');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-missing','true');
  await page.getByRole('button',{name:'Home',exact:true}).click();
  await openDrawing(page,'Site_Plan_FR.dwg');
  await expect(page.getByLabel('Display language',{exact:true})).toHaveValue('fr');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text','ENTRÉE DU SITE');
});
test('batch: reusable preset, per-file progress, report filter and cross-drawing instance navigation',async({page},info)=>{
  await page.getByRole('button',{name:'Translate Drawings',exact:true}).click();
  for(const name of ['Level_01.dwg','Level_02.dwg','Site_Plan.dwg'])await page.getByRole('checkbox',{name:'Select '+name,exact:true}).check();
  await expect(page.getByText('3 drawings selected',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByLabel('Reusable preset',{exact:true}).selectOption('architectural');
  await page.getByRole('button',{name:'Load Preset',exact:true}).click();
  await page.getByRole('button',{name:'Save Preset',exact:true}).click();
  await page.getByLabel('Preset name',{exact:true}).fill('Presentation notes');
  await page.getByRole('button',{name:'Save settings',exact:true}).click();
  await expect(page.getByLabel('Reusable preset',{exact:true})).toContainText('Presentation notes');
  await page.getByRole('button',{name:'Review preview',exact:true}).click();
  await page.getByRole('radio',{name:/Create translated copies/}).check();
  await page.getByRole('button',{name:'Start translation',exact:true}).click();
  await expect(page.locator('.progress-files>div')).toHaveCount(3);
  await page.screenshot({path:info.outputPath('batch-progress.png')});
  await expect(page.getByRole('heading',{name:'Translation complete',exact:true})).toBeVisible();
  await page.getByLabel('Filter report by drawing',{exact:true}).selectOption({label:'Site_Plan_FR.dwg'});
  await expect(page.locator('.report tbody tr')).toHaveCount(26);
  await page.getByRole('button',{name:'Locate FFL 0.000 in Site_Plan_FR.dwg',exact:true}).first().click();
  await expect(page.locator('.ribbon-title')).toContainText('Site_Plan_FR.dwg');
  await expect(page.locator('.instance-bar')).toContainText('6 instances across 3 drawings');
  await page.locator('.instance-bar').getByRole('button',{name:'Previous',exact:true}).click();
  await expect(page.locator('.ribbon-title')).toContainText('Level_02_FR.dwg');
});
test('glossary: protected equipment tags and preferred target text are deterministic',async({page})=>{
  await page.getByRole('button',{name:/Project glossary/}).click();
  await page.getByLabel('Glossary term type',{exact:true}).selectOption('preferred');
  await page.getByLabel('Glossary source term',{exact:true}).fill('Fire Pump Room');
  await page.getByLabel('Preferred target term',{exact:true}).fill('LOCAL DU PROJET');
  await page.getByRole('button',{name:'Add term',exact:true}).click();
  await page.getByRole('button',{name:'Done',exact:true}).click();
  await openDrawing(page,'Mechanical_Plan.dwg');
  for(const id of ['txt-001','txt-002','txt-011'])await page.locator('[data-object-id="'+id+'"]').click();
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await reviewAndRun(page);
  await expect(page.locator('.report')).toContainText('INSTALLER AHU-01 AU-DESSUS DU PLAFOND');
  await expect(page.locator('.report')).toContainText('RACCORDER DN100 AU HVAC SYSTÈME');
  await expect(page.locator('.report')).toContainText('LOCAL DU PROJET');
});
test('canvas editing, fill-missing preservation and source invalidation survive reload',async({page})=>{
  await openDrawing(page,'Level_01.dwg');
  await page.locator('[data-object-id="txt-001"]').click();
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await reviewAndRun(page);
  await page.getByRole('button',{name:'Locate FIRE PUMP ROOM in Level_01.dwg',exact:true}).click();
  await page.getByRole('button',{name:'Close report',exact:true}).click();
  await page.locator('[data-object-id="txt-001"]').dblclick();
  await page.getByLabel('Drawing text',{exact:true}).fill('MANUAL ROOM LABEL');
  await page.getByRole('button',{name:'Save text',exact:true}).click();
  await page.getByRole('button',{name:'Translate All',exact:true}).click();
  await page.getByRole('button',{name:'Review preview',exact:true}).click();
  await expect(page.locator('.preview-reasons')).toContainText('Existing translation preserved');
  await page.getByRole('button',{name:'Start translation',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Translation complete',exact:true})).toBeVisible();
  await page.reload();
  await openDrawing(page,'Level_01.dwg');
  await page.getByLabel('Display language',{exact:true}).selectOption('fr');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text','MANUAL ROOM LABEL');
  await page.getByLabel('Display language',{exact:true}).selectOption('en');
  await page.locator('[data-object-id="txt-001"]').dblclick();
  await page.getByLabel('Drawing text',{exact:true}).fill('NEW SOURCE ROOM');
  await page.getByRole('button',{name:'Save text',exact:true}).click();
  await page.getByLabel('Display language',{exact:true}).selectOption('fr');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text','NEW SOURCE ROOM');
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-missing','true');
});
test('interrupted jobs recover safely and reset restores the original workspace',async({page})=>{
  await page.getByRole('button',{name:'Translate Drawings',exact:true}).click();
  for(const name of ['Level_01.dwg','Level_02.dwg','Mechanical_Plan.dwg','Site_Plan.dwg'])await page.getByRole('checkbox',{name:'Select '+name,exact:true}).check();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByRole('button',{name:'Review preview',exact:true}).click();
  await page.getByRole('button',{name:'Start translation',exact:true}).click();
  await expect(page.getByRole('progressbar')).toBeVisible();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('cad-translate-studio-v1')||'{}').jobs?.[0]?.rows?.some((r:{status:string})=>r.status==='Translated'||r.status==='Warning'));
  await page.reload();
  await expect(page.getByRole('progressbar')).not.toBeVisible();
  await page.getByRole('button',{name:/Translation reports/}).click();
  await expect(page.getByRole('heading',{name:'Translation interrupted',exact:true})).toBeVisible();
  await expect(page.locator('.report')).toContainText('Interrupted by page reload');
  await page.getByRole('button',{name:'Reset demo data',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Reset demo data',exact:true}).click();
  await expect(page.locator('.drawing-card')).toHaveCount(4);
  await expect(page.locator('.language-chips>span')).toHaveCount(0);
});
test('laptop and narrow layouts expose functional controls without page overflow',async({page},info)=>{
  await page.setViewportSize({width:1280,height:800});
  await page.screenshot({path:info.outputPath('home-laptop.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await openDrawing(page,'Level_01.dwg');
  await expect(page.getByRole('button',{name:'Translate All',exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('drawing-laptop.png')});
  await page.setViewportSize({width:650,height:850});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page.getByLabel('Display language',{exact:true})).toBeVisible();
  await page.screenshot({path:info.outputPath('drawing-narrow.png')});
});

test('Gemini UI uses the real service contract and preserves prior text after authentication failure',async({page})=>{
  let fail=false;
  await page.route('https://generativelanguage.googleapis.com/**',async route=>{
    if(route.request().method()==='OPTIONS'){
      await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type,x-goog-api-key'}});return;
    }
    if(fail){await route.fulfill({status:403,headers:{'access-control-allow-origin':'*'},json:{error:{message:'Test authentication failure'}}});return;}
    const data=JSON.parse(route.request().postData()!);
    const input=JSON.parse(data.contents[0].parts[0].text) as {id:string;text:string}[];
    await route.fulfill({headers:{'access-control-allow-origin':'*'},json:{candidates:[{content:{parts:[{text:JSON.stringify(input.map(i=>({id:i.id,text:'SERVICE RESULT'})))}]}}]}});
  });
  await page.getByLabel('Translation provider',{exact:true}).selectOption('gemini');
  await openDrawing(page,'Level_01.dwg');
  await page.locator('[data-object-id="txt-001"]').click();
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await reviewAndRun(page);
  await expect(page.locator('.report')).toContainText('SERVICE RESULT');
  await page.getByRole('button',{name:'Locate FIRE PUMP ROOM in Level_01.dwg',exact:true}).click();
  await page.getByRole('button',{name:'Close report',exact:true}).click();
  fail=true;
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await page.getByRole('checkbox',{name:'Replace existing translations in French',exact:true}).check();
  await reviewAndRun(page);
  await expect(page.locator('.report')).toContainText('Gemini authentication failed');
  await page.getByRole('button',{name:'Locate FIRE PUMP ROOM in Level_01.dwg',exact:true}).click();
  await expect(page.locator('[data-object-id="txt-001"]')).toHaveAttribute('data-display-text','SERVICE RESULT');
});

test('glossary terms never reach MT and report reasons distinguish skips from unchanged API results',async({page})=>{
  const submitted:string[]=[];
  await page.route('https://generativelanguage.googleapis.com/**',async route=>{
    if(route.request().method()==='OPTIONS'){
      await route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':'content-type,x-goog-api-key'}});return;
    }
    const data=JSON.parse(route.request().postData()!);
    const input=JSON.parse(data.contents[0].parts[0].text) as {id:string;text:string}[];
    expect(JSON.stringify(data)).not.toMatch(/AHU-01|__CAD_TERM_/);
    expect(data.systemInstruction.parts[0].text).not.toMatch(/placeholder|preserve/i);
    submitted.push(...input.map(i=>i.text));
    const result=input.map(i=>({id:i.id,text:i.text==='INSTALL'?'INSTALLER':i.text==='ABOVE CEILING'?'AU-DESSUS DU PLAFOND':i.text}));
    await route.fulfill({headers:{'access-control-allow-origin':'*'},json:{candidates:[{content:{parts:[{text:JSON.stringify(result)}]}}]}});
  });
  await page.getByLabel('Translation provider',{exact:true}).selectOption('gemini');
  await openDrawing(page,'Mechanical_Plan.dwg');
  for(const id of ['txt-001','txt-004','txt-020'])await page.locator('[data-object-id="'+id+'"]').click();
  await page.getByRole('button',{name:/Translate Selection/}).click();
  await reviewAndRun(page);
  expect(submitted).toEqual(['INSTALL','ABOVE CEILING','RETURN AIR DUCT']);
  const skipped=page.locator('.report tbody tr').filter({has:page.getByText('AHU-01',{exact:true})});
  await expect(skipped).toContainText('Skipped');
  await expect(skipped).toContainText('Listed in glossary (do not translate); not sent to MT API');
  const unchanged=page.locator('.report tbody tr').filter({has:page.getByText('RETURN AIR DUCT',{exact:true})});
  await expect(unchanged).toContainText('Unchanged');
  await expect(unchanged).toContainText('MT API returned the submitted text unchanged');
  await expect(page.locator('.report')).toContainText('INSTALLER AHU-01 AU-DESSUS DU PLAFOND');
});
