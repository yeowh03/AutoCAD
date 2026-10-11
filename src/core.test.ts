import { describe, expect, it } from 'vitest';
import { assessScope, createCopy, defaultSettings, editObject, freshLocateDemo, freshState, instances, reportInstanceKey, jobSourceLabel, restoreState, retainedObjects, previewTranslation, jobTargetLabel } from './core';
import { prepareJob, runJob } from './jobs';
import { DemoProvider, GeminiProvider } from './providers';
import type { Language, PersistedState, ProviderItem, Settings, TranslationProvider } from './types';

const settings = (patch: Partial<Settings> = {}): Settings => ({ ...defaultSettings('demo'), ...patch });
async function translate(state: PersistedState, drawingId: string, config = settings(), selection?: string[], provider: TranslationProvider = new DemoProvider(0)) {
  const prepared = prepareJob(state, { drawingIds: [drawingId], selection }, config);
  return runJob(prepared.state, prepared.jobId, prepared.decisions, config, provider, () => {}, (object, text) => text !== object.text && object.width < 140);
}
describe('single-language drawings and eligibility', () => {
  it('seeds four sample drawings and a five-instance Locate demo without alternate text versions', () => {
    const state = freshState();
    expect(state.version).toBe(2); expect(state.drawings).toHaveLength(5);
    for (const drawing of state.drawings) {
      expect(drawing.language).toBe('en'); expect(drawing.baseName).toBe(drawing.name);
      expect(drawing.objects.every(o => typeof o.text === 'string' && o.language === 'en' && !('sourceText' in o) && !('translations' in o))).toBe(true);
      expect(new Set(drawing.objects.map(o => o.id)).size).toBe(drawing.objects.length);
    }
    const demo = state.drawings.find(d => d.demo)!;
    expect(demo.objects).toHaveLength(5);
    expect(new Set(demo.objects.map(o => o.text))).toEqual(new Set(['FIRE PUMP ROOM']));
    expect(state).not.toHaveProperty('glossary'); expect(state).not.toHaveProperty('presets');
  });
  it('partitions scope using fixed eligibility rules and does not send locked or unsupported objects', () => {
    const state = freshState();
    const rows = assessScope(state.drawings, { drawingIds: state.drawings.map(d => d.id) }, 'fr');
    expect(rows).toHaveLength(109);
    expect(rows.filter(r => r.status === 'Failed')).toHaveLength(5);
    expect(rows.filter(r => r.reason === 'Object type not supported')).toHaveLength(5);
    expect(rows.some(r => r.reason.includes('Drawing reference'))).toBe(true);
    expect(rows.some(r => r.reason.includes('Dimension / level'))).toBe(true);
    state.drawings[0].objects[0].text = '1200';
    expect(assessScope(state.drawings, { drawingIds: ['level-01'] }, 'fr')[0].reason).toContain('Numeric-only');
  });
  it('restricts selection to its drawing even when object IDs repeat across files', () => {
    const state = freshState();
    const rows = assessScope(state.drawings, { drawingIds: ['mechanical'], selection: ['txt-001','txt-002','txt-003'] }, 'fr');
    expect(rows).toHaveLength(3); expect(rows.every(r => r.eligible && r.drawing.id === 'mechanical')).toBe(true);
  });
  it('keeps manual edits in the current file language and refuses locked edits', () => {
    const state = freshState(); state.drawings[0].language = 'fr';
    const edited = editObject(state.drawings, 'level-01', 'txt-001', 'MANUAL ROOM');
    expect(edited[0].objects[0]).toMatchObject({ text: 'MANUAL ROOM', language: 'fr' });
    const locked = state.drawings[0].objects.find(o => o.locked)!;
    expect(editObject(state.drawings, 'level-01', locked.id, 'WRONG')[0].objects.find(o => o.id === locked.id)!.text).toBe(locked.text);
  });
  it('creates independent, collision-safe copies from the base drawing name', () => {
    const state = freshState(), source = state.drawings[0];
    const french = createCopy(source, 'fr', state.drawings);
    const german = createCopy(french, 'de', [...state.drawings, french]);
    const second = createCopy(source, 'fr', [...state.drawings, french]);
    expect(french.name).toBe('Level_01_FR.dwg'); expect(german.name).toBe('Level_01_DE.dwg'); expect(second.name).toBe('Level_01_FR_2.dwg');
    french.objects[0].text = 'EDIT'; expect(source.objects[0].text).toBe('FIRE PUMP ROOM');
  });
});

describe('write-back, reports and Locate demo', () => {
  it('groups navigation by source snapshot and status without joining different outcomes', async () => {
    const result=await translate(freshState(),'locate-demo');
    const rows=result.jobs[0].rows;
    expect(instances(rows,'FIRE PUMP ROOM','Translated').map(row=>row.objectId)).toEqual(['locate-demo-translated']);
    expect(instances(rows,'FIRE PUMP ROOM','Warning').map(row=>row.objectId)).toEqual(['locate-demo-overflow']);
    expect(instances(rows,'FIRE PUMP ROOM','Failed').map(row=>row.objectId)).toEqual(['locate-demo-locked']);
    const skipped=instances(rows,'FIRE PUMP ROOM','Skipped');
    expect(skipped.map(row=>row.objectId)).toEqual(['locate-demo-unsupported','locate-demo-unchanged']);
    expect(skipped.map(row=>row.reason)).toEqual(['Object type not supported','Offline MT simulation returned the submitted text unchanged']);
    expect(instances(rows,'OTHER TEXT','Skipped')).toEqual([]);
    const saved=restoreState(JSON.stringify(result));
    expect(instances(saved.jobs[0].rows,'FIRE PUMP ROOM','Warning')).toEqual(instances(rows,'FIRE PUMP ROOM','Warning'));
  });

  it('persists independent outcomes for identical text and object IDs across drawings and targets', async () => {
    const state=freshState();
    state.drawings=state.drawings.slice(0,4).map((drawing,index)=>({...drawing,objects:[{
      ...drawing.objects[0],id:'shared-object',text:'FIRE PUMP ROOM',
      type:index===3?'Unsupported' as const:'MText' as const,locked:index===2,width:index===1?80:400,
    }]}));
    const config=settings({targets:['fr','de']});
    const prepared=prepareJob(state,{drawingIds:state.drawings.map(drawing=>drawing.id)},config);
    const result=await runJob(prepared.state,prepared.jobId,prepared.decisions,config,new DemoProvider(0),()=>{},object=>object.width<140);
    const saved=restoreState(JSON.stringify(result)), job=saved.jobs[0];
    expect(job.rows.map(row=>row.status)).toEqual(['Translated','Warning','Failed','Skipped','Translated','Warning','Failed','Skipped']);
    expect(new Set(job.rows.map(row=>row.original))).toEqual(new Set(['FIRE PUMP ROOM']));
    expect(new Set(job.rows.map(row=>row.objectId))).toEqual(new Set(['shared-object']));
    expect(new Set(job.rows.map(reportInstanceKey)).size).toBe(8);
    expect(job.rows).toEqual(result.jobs[0].rows);
    for(const row of job.rows){
      const output=saved.drawings.find(drawing=>drawing.id===row.outputDrawingId)!;
      const object=output.objects.find(item=>item.id===row.objectId)!;
      expect(object.lastStatus).toBe(row.status);
      expect(object.lastReason).toBe(row.reason);
      if(row.status==='Failed')expect(row.reason).toBe('Object is on a locked layer');
      if(row.status==='Skipped')expect(row.reason).toBe('Object type not supported');
      if(row.status==='Translated')expect(row.reason).toBe('Offline MT simulation translation stored successfully');
      if(row.status==='Warning')expect(row.reason).toBe('Translated text may exceed original text bounds');
    }
    expect(state.drawings.every(drawing=>drawing.objects[0].text==='FIRE PUMP ROOM'&&!drawing.objects[0].lastStatus)).toBe(true);
  });

  it('produces four statuses across five identical source instances through the ordinary job engine', async () => {
    const state = freshState();
    const result = await translate(state, 'locate-demo');
    const job = result.jobs[0], output = result.drawings.find(d => d.id === job.files[0].outputId)!;
    expect(job.rows.map(r => r.status)).toEqual(['Translated','Warning','Failed','Skipped','Skipped']);
    expect(new Set(job.rows.map(r => r.original))).toEqual(new Set(['FIRE PUMP ROOM']));
    expect(job.rows[4].reason).toBe('Offline MT simulation returned the submitted text unchanged');
    expect(job.rows[2].reason).toBe('Object is on a locked layer');
    expect(job.rows[3].reason).toBe('Object type not supported');
    expect(job.rows[2].translation).toBe('FIRE PUMP ROOM'); expect(job.rows[3].translation).toBe('FIRE PUMP ROOM');
    expect(output.objects.map(o => o.language)).toEqual(['fr','fr','en','en','en']);
    expect(output.objects[2].text).toBe('FIRE PUMP ROOM');
    expect(job.rows.every(r => output.objects.some(o => o.id === r.objectId))).toBe(true);
    expect(instances(job.rows,'FIRE PUMP ROOM','Warning')).toHaveLength(1);
    expect(instances(job.rows,'FIRE PUMP ROOM','Skipped')).toHaveLength(2);
    expect(job.processed).toBe(job.total);
    expect(state.drawings.find(d => d.demo)!.objects.every(o => o.language === 'en')).toBe(true);
  });
  it('replaces original current text and retains immutable report snapshots', async () => {
    const state = freshState();
    const result = await translate(state,'level-01',settings({output:'same'}),['txt-001','txt-015']);
    const drawing = result.drawings[0];
    expect(result.drawings).toHaveLength(5); expect(drawing.name).toBe('Level_01.dwg'); expect(drawing.language).toBe('fr');
    expect(drawing.objects[0].text).toBe('LOCAL DES POMPES INCENDIE');
    expect(drawing.objects[14].language).toBe('en'); expect(drawing.objects[14].lastStatus).toBe('Failed');
    expect(retainedObjects(drawing)).toBeGreaterThan(0);
    expect(result.jobs[0].rows[0].original).toBe('FIRE PUMP ROOM');
    const edited = editObject(result.drawings,drawing.id,'txt-001','MANUAL');
    expect(edited[0].objects[0].text).toBe('MANUAL');
    expect(result.jobs[0].rows[0].translation).toBe('LOCAL DES POMPES INCENDIE');
  });
  it('translates only the requested selection into a copy', async () => {
    const state = freshState();
    const result = await translate(state,'site',settings(),['txt-001','txt-002']);
    expect(result.drawings.find(d => d.id === 'site')).toEqual(state.drawings.find(d => d.id === 'site'));
    const copy = result.drawings.find(d => d.copiedFrom === 'site')!;
    expect(copy.language).toBe('fr'); expect(copy.objects.filter(o => o.language === 'fr')).toHaveLength(2);
    expect(result.jobs[0].rows.every(r => r.outputDrawingId === copy.id)).toBe(true);
  });
  it('submits target-language text again and uses Skipped only after an unchanged MT response', async () => {
    const state = freshState();
    state.drawings[0].objects[0].language = 'fr'; state.drawings[0].objects[0].text = 'MANUAL FRENCH';
    const requests: ProviderItem[] = [];
    const provider: TranslationProvider = { translate: async items => { requests.push(...items); return items.map(i=>({id:i.id,text:i.text})); } };
    const result = await translate(state,'level-01',settings({provider:'gemini',output:'same'}),['txt-001','txt-002'],provider);
    expect(requests.map(i=>i.objectId)).toEqual(['txt-001','txt-002']);
    expect(requests.map(i=>i.sourceLanguage)).toEqual(['fr','en']);
    expect(result.jobs[0].rows[0].reason).toBe('MT API returned the submitted text unchanged');
    expect(result.jobs[0].rows[1].reason).toBe('MT API returned the submitted text unchanged');
    expect(result.jobs[0].rows.every(r=>r.status==='Skipped')).toBe(true);
    expect(result.drawings[0].objects[0].text).toBe('MANUAL FRENCH');
  });
  it('keeps valid current text when translation to a different language fails', async () => {
    const state=freshState(); state.drawings[0].language='fr'; state.drawings[0].objects[0].text='MANUAL'; state.drawings[0].objects[0].language='fr';
    const result=await translate(state,'level-01',settings({targets:['de'],output:'same'}),['txt-001'],{translate:async()=>{throw new Error('Service unavailable');}});
    expect(result.drawings[0].language).toBe('fr'); expect(result.drawings[0].objects[0].text).toBe('MANUAL');
    expect(result.jobs[0].rows[0].status).toBe('Failed');
    expect(result.jobs[0].rows[0].translation).toBe('MANUAL');
  });
  it('groups requests by actual source language and limits each request to five objects', async () => {
    const state=freshState(), drawing=state.drawings[0];
    const languages: Language[]=['en','fr','de'];
    drawing.objects=drawing.objects.slice(0,12).map((o,i)=>({...o,text:'ROOM LABEL '+i,language:languages[i<6?0:i<9?1:2],locked:false}));
    const calls: ProviderItem[][]=[];
    const result=await translate(state,drawing.id,settings({targets:['zh'],output:'same'}),undefined,{translate:async items=>{calls.push(items);return items.map(i=>({id:i.id,text:'房间'}));}});
    expect(calls.map(c=>c.length)).toEqual([5,1,3,3]);
    expect(calls.every(c=>new Set(c.map(i=>i.sourceLanguage)).size===1)).toBe(true);
    expect(result.jobs[0].rows[7].sourceLanguage).toBe('fr'); expect(jobSourceLabel(result.jobs[0])).toBe('Multiple source languages');
    expect(result.drawings[0].objects.every(o=>o.language==='zh')).toBe(true);
  });
  it('continues after service errors and stores successful items incrementally', async () => {
    const state=freshState(), config=settings({output:'same'});
    const prepared=prepareJob(state,{drawingIds:['mechanical']},config);
    const snapshots:string[]=[];
    const result=await runJob(prepared.state,prepared.jobId,prepared.decisions,config,new DemoProvider(0),s=>snapshots.push(JSON.stringify(s)));
    expect(result.jobs[0].rows.find(r=>r.original==='VERIFY DUCT CONNECTION')!.status).toBe('Failed');
    expect(result.drawings.find(d=>d.id==='mechanical')!.objects[0].text).toBe('INSTALLER AHU-01 AU-DESSUS DU PLAFOND');
    expect(snapshots.length).toBeGreaterThan(3);
    const partial=snapshots.map(s=>JSON.parse(s) as PersistedState).find(s=>s.jobs[0].status==='Running'&&s.jobs[0].rows.some(r=>r.status==='Translated'))!;
    const recovered=restoreState(JSON.stringify(partial));
    expect(recovered.jobs[0].status).toBe('Interrupted');
    expect(recovered.jobs[0].rows.some(r=>r.reason.startsWith('Interrupted by page reload'))).toBe(true);
    expect(recovered.drawings.find(d=>d.id==='mechanical')!.objects[0].text).toBe('INSTALLER AHU-01 AU-DESSUS DU PLAFOND');
  });
  it('reuses pristine demo input and creates a fresh input after edits without clearing results', async () => {
    const state=freshState();
    expect(freshLocateDemo(state.drawings).drawing.id).toBe('locate-demo');
    const translated=await translate(state,'locate-demo',settings({output:'same'}));
    const fresh=freshLocateDemo(translated.drawings);
    expect(fresh.drawing.name).toBe('Locate_Demo_2.dwg'); expect(fresh.drawings).toHaveLength(6);
    expect(fresh.drawing.objects.every(o=>o.text==='FIRE PUMP ROOM'&&o.language==='en'&&!o.lastStatus)).toBe(true);
    expect(translated.jobs).toHaveLength(1); expect(translated.drawings.find(d=>d.id==='locate-demo')!.language).toBe('fr');
  });
  it('can produce separate files in every supported target language', async () => {
    for(const target of ['fr','de','zh'] as const) {
      const state=freshState(), result=await translate(state,'level-01',settings({targets:[target]}),['txt-001']);
      expect(result.jobs[0].rows[0].status).not.toBe('Failed');
      expect(result.drawings.at(-1)!.language).toBe(target);
    }
  });
});

function legacyFixture() {
  const original=freshState().drawings[0];
  const objects=original.objects.slice(0,2).map((o,i)=>{
    const {text,language,lastStatus,lastReason,...geometry}=o;
    return {...geometry,sourceText:i?'SECOND SOURCE':'EDITED ENGLISH SOURCE',translations:i?{}:{fr:'MANUAL FRENCH',de:'MANUAL GERMAN'}};
  });
  const {language,baseName,...metadata}=original;
  const drawing={...metadata,objects};
  const copy={...drawing,id:'old-copy',name:'Level_01_FR.dwg',copiedFrom:drawing.id,objects:objects.map(o=>({...o,sourceText:'COPY SOURCE SNAPSHOT',translations:{fr:'COPY FRENCH'}}))};
  const row={id:'old-row',sourceDrawingId:drawing.id,outputDrawingId:drawing.id,drawingName:drawing.name,objectId:objects[0].id,type:'MText',layer:objects[0].layer,original:'ORIGINAL JOB SNAPSHOT',translation:'OLD TRANSLATION',status:'Translated',reason:'Stored',target:'fr'};
  const job={id:'old-job',startedAt:'2026-10-09T00:00:00Z',status:'Complete',target:'fr',provider:'demo',total:1,processed:1,rows:[row],files:[{sourceId:drawing.id,outputId:drawing.id,name:drawing.name,total:1,processed:1,status:'Complete'}]};
  return {version:1,drawings:[drawing,copy],glossary:[{id:'old',source:'HVAC'}],presets:[{id:'old',name:'Old settings'}],jobs:[job]};
}
describe('saved workspace migration',()=>{
  it.each(['MT API','Offline MT simulation'])('clarifies older %s warning reasons without changing instance outcomes or snapshots', async service=>{
    const result=await translate(freshState(),'locate-demo');
    const warning=result.jobs[0].rows[1];
    const oldReason='Translated text may exceed original text bounds; '+service+' translation stored successfully';
    warning.reason=oldReason;
    const output=result.drawings.find(drawing=>drawing.id===warning.outputDrawingId)!;
    output.objects.find(object=>object.id===warning.objectId)!.lastReason=oldReason;
    const saved=restoreState(JSON.stringify(result)), row=saved.jobs[0].rows[1];
    expect(row.reason).toBe('Translated text may exceed original text bounds');
    expect(row.status).toBe('Warning');
    expect(row.original).toBe(warning.original); expect(row.translation).toBe(warning.translation);
    expect(reportInstanceKey(row)).toBe(reportInstanceKey(warning));
    expect(saved.jobs[0].rows).toHaveLength(5);
    expect(saved.jobs[0].rows.map(item=>item.status)).toEqual(result.jobs[0].rows.map(item=>item.status));
    expect(saved.jobs[0].rows[0].reason).toBe(result.jobs[0].rows[0].reason);
    const object=saved.drawings.find(drawing=>drawing.id===row.outputDrawingId)!.objects.find(item=>item.id===row.objectId)!;
    expect(object.lastStatus).toBe('Warning'); expect(object.lastReason).toBe(row.reason);
    expect(object.text).toBe(row.translation);
    expect(restoreState(JSON.stringify(saved))).toEqual(saved);
  });

  it.each([1,2])('merges saved Unchanged results into Skipped in version %s without losing snapshots or Locate references', async version=>{
    const result=await translate(freshState(),'locate-demo');
    const raw=JSON.parse(JSON.stringify(version===1?legacyFixture():result));
    const row=raw.jobs[0].rows[version===1?0:4];
    row.status='Unchanged';
    const object=raw.drawings[0].objects[0];
    object.lastStatus='Unchanged'; object.lastReason='Legacy result preserved';
    const snapshots={before:row.original,after:row.translation,reason:row.reason};
    const restored=restoreState(JSON.stringify(raw));
    const restoredRow=restored.jobs[0].rows.find(item=>item.id===row.id)!;
    expect(restoredRow).toMatchObject({status:'Skipped',original:snapshots.before,translation:snapshots.after,reason:snapshots.reason});
    expect(restored.drawings[0].objects[0]).toMatchObject({lastStatus:'Skipped',lastReason:object.lastReason});
    const output=restored.drawings.find(drawing=>drawing.id===restoredRow.outputDrawingId)!;
    expect(output.objects.some(item=>item.id===restoredRow.objectId)).toBe(true);
    expect(restored.jobs[0].files.some(file=>file.outputId===output.id)).toBe(true);
    expect(restored.drawings.every(drawing=>drawing.objects.every(item=>String(item.lastStatus)!=='Unchanged'))).toBe(true);
    expect(restored.jobs.every(job=>job.rows.every(item=>String(item.status)!=='Unchanged'))).toBe(true);
    expect(restoreState(JSON.stringify(restored))).toEqual(restored);
  });

  it('migrates all language versions and manual edits without losing report snapshots or references',()=>{
    const old=legacyFixture(), migrated=restoreState(JSON.stringify(old));
    expect(migrated.version).toBe(2); expect(migrated.drawings).toHaveLength(6);
    expect(migrated).not.toHaveProperty('glossary'); expect(migrated).not.toHaveProperty('presets');
    expect(migrated.drawings.find(d=>d.id==='level-01')!.objects[0].text).toBe('EDITED ENGLISH SOURCE');
    const french=migrated.drawings.find(d=>d.name==='Level_01_FR_2.dwg')!;
    expect(french.objects[0].text).toBe('MANUAL FRENCH'); expect(french.objects[0].language).toBe('fr');
    expect(french.objects[1].text).toBe('SECOND SOURCE'); expect(french.objects[1].language).toBe('en');
    expect(migrated.drawings.find(d=>d.name==='Level_01_DE.dwg')!.objects[0].text).toBe('MANUAL GERMAN');
    expect(migrated.drawings.find(d=>d.id==='old-copy')!.objects[0].text).toBe('COPY FRENCH');
    expect(migrated.drawings.some(d=>d.objects[0].text==='COPY SOURCE SNAPSHOT'&&d.language==='en')).toBe(true);
    expect(migrated.jobs[0].rows[0].outputDrawingId).toBe(french.id);
    expect(migrated.jobs[0].files[0].outputId).toBe(french.id);
    expect(migrated.jobs[0].rows[0].original).toBe('ORIGINAL JOB SNAPSHOT');
    expect(migrated.jobs[0].rows[0].translation).toBe('OLD TRANSLATION');
    expect(migrated.drawings.every(d=>d.objects.every(o=>!('sourceText' in o)&&!('translations' in o)))).toBe(true);
    expect(new Set(migrated.drawings.map(d=>d.name)).size).toBe(migrated.drawings.length);
  });
  it('migrates copied-file report source/output references to their proper English/French files',()=>{
    const old=legacyFixture();
    old.jobs[0].rows[0].sourceDrawingId='old-copy';old.jobs[0].rows[0].outputDrawingId='old-copy';
    old.jobs[0].files[0].sourceId='old-copy';old.jobs[0].files[0].outputId='old-copy';
    const state=restoreState(JSON.stringify(old)), row=state.jobs[0].rows[0];
    expect(row.outputDrawingId).toBe('old-copy');
    expect(state.drawings.find(d=>d.id===row.sourceDrawingId)!.language).toBe('en');
    expect(state.jobs[0].files[0].sourceId).toBe(row.sourceDrawingId);
  });
  it('round-trips the v2 workspace and does not duplicate the demo or migrated copies',()=>{
    const migrated=restoreState(JSON.stringify(legacyFixture()));
    const restored=restoreState(JSON.stringify(migrated));
    expect(restored).toEqual(migrated); expect(restored.drawings.filter(d=>d.demo==='locate')).toHaveLength(1);
    expect(restoreState('bad JSON').drawings).toHaveLength(5);
    expect(restoreState(JSON.stringify({...freshState(),version:999})).version).toBe(2);
  });
});

describe('migration and history edge cases', () => {
  it('creates a target exception file for historical jobs even when all target values are absent', () => {
    const old=legacyFixture();
    old.drawings=old.drawings.slice(0,1);
    old.drawings[0].objects.forEach(o=>{o.translations={};});
    old.jobs[0].rows[0].status='Failed'; old.jobs[0].rows[0].translation='';
    const state=restoreState(JSON.stringify(old)), row=state.jobs[0].rows[0];
    const output=state.drawings.find(d=>d.id===row.outputDrawingId)!;
    expect(output.language).toBe('fr'); expect(output.name).toBe('Level_01_FR.dwg');
    expect(output.objects[0].text).toBe('EDITED ENGLISH SOURCE'); expect(output.objects[0].language).toBe('en');
    expect(state.jobs[0].files[0].outputId).toBe(output.id);
  });
  it('retains previous reports when starting another job after twenty jobs', () => {
    const state=restoreState(JSON.stringify(legacyFixture()));
    state.jobs=Array.from({length:25},(_,i)=>({...state.jobs[0],id:'history-'+i}));
    const prepared=prepareJob(state,{drawingIds:['level-01'],selection:['txt-001']},settings());
    expect(prepared.state.jobs).toHaveLength(26);
    expect(prepared.state.jobs.at(-1)!.id).toBe('history-24');
  });
  it.each(['bad-json','[{"id":"wrong","text":"OVERWRITE"}]','[{"id":"level-01:txt-001","text":""}]'])('does not overwrite valid current text after malformed service output %s', async payload => {
    const state=freshState(); state.drawings[0].language='fr'; state.drawings[0].objects[0].text='VALID MANUAL FRENCH'; state.drawings[0].objects[0].language='fr';
    const fetcher:typeof fetch=async()=>new Response(JSON.stringify({candidates:[{content:{parts:[{text:payload}]}}]}));
    const result=await translate(state,'level-01',settings({targets:['de'],provider:'gemini',output:'same'}),['txt-001'],new GeminiProvider('key','test',fetcher));
    expect(result.jobs[0].rows[0].status).toBe('Failed');
    expect(result.drawings[0].objects[0].text).toBe('VALID MANUAL FRENCH');
    expect(result.drawings[0].objects[0].language).toBe('fr');
  });
});

describe('skipped results and multiple target languages', () => {
  it('previews current eligible text for every target without consulting prior statuses or language', () => {
    const state=freshState(), demo=state.drawings.find(drawing=>drawing.demo)!;
    demo.objects[0].language='fr'; demo.objects[0].text='LOCAL DES POMPES INCENDIE'; demo.objects[0].lastStatus='Translated';
    demo.objects[1].lastStatus='Skipped'; demo.objects[4].lastStatus='Failed';
    demo.objects[2].language='fr';
    expect(previewTranslation(state.drawings,{drawingIds:[demo.id]},['fr','de','zh'])).toEqual({
      perTarget:[{target:'fr',count:3},{target:'de',count:3},{target:'zh',count:3}],total:9,
    });
    expect(previewTranslation(state.drawings,{drawingIds:[demo.id],selection:[demo.objects[0].id,demo.objects[2].id]},['fr','de']).total).toBe(2);
    expect(previewTranslation(state.drawings,{drawingIds:[demo.id]},['fr','fr']).total).toBe(3);
    expect(previewTranslation(state.drawings,{drawingIds:[demo.id]},[]).total).toBe(0);
    expect(assessScope(state.drawings,{drawingIds:[demo.id]},'fr')[2].status).toBe('Failed');
    expect(previewTranslation(state.drawings,{drawingIds:['level-01','site']},['fr','de']).total).toBe(60);
  });
  it('resubmits a previously translated object after reload using its current text and source language', async () => {
    const first=await translate(freshState(),'level-01',settings({output:'same'}),['txt-001']);
    const state=restoreState(JSON.stringify(first));
    const preview=previewTranslation(state.drawings,{drawingIds:['level-01'],selection:['txt-001']},['fr']);
    expect(preview.total).toBe(1);
    const requests:ProviderItem[]=[];
    const result=await translate(state,'level-01',settings({provider:'gemini',output:'same'}),['txt-001'],{
      translate:async items=>{requests.push(...items);return items.map(item=>({id:item.id,text:'UPDATED FRENCH TEXT'}));},
    });
    expect(requests).toHaveLength(preview.total);
    expect(requests[0]).toMatchObject({objectId:'txt-001',text:'LOCAL DES POMPES INCENDIE',sourceLanguage:'fr'});
    expect(result.drawings[0].objects[0].text).toBe('UPDATED FRENCH TEXT');
    expect(result.jobs[0].rows[0].original).toBe('LOCAL DES POMPES INCENDIE');
    expect(result.jobs[1].rows[0].original).toBe('FIRE PUMP ROOM');
    expect(state.drawings[0].objects[0].text).toBe('LOCAL DES POMPES INCENDIE');
  });

  it('keeps the current text and language when MT returns the submitted text', async () => {
    const state=freshState();
    const result=await translate(state,'level-01',settings({provider:'gemini',output:'same'}),['txt-001'],{
      translate:async items=>items.map(item=>({id:item.id,text:item.text})),
    });
    expect(result.jobs[0].rows[0]).toMatchObject({status:'Skipped',original:'FIRE PUMP ROOM',translation:'FIRE PUMP ROOM'});
    expect(result.drawings[0].objects[0]).toMatchObject({text:'FIRE PUMP ROOM',language:'en',lastStatus:'Skipped'});
    expect(result.drawings[0].language).toBe('en');
    expect(result.jobs[0].files[0].status).toBe('Complete');
  });
  it('creates independent outputs per language and passes the correct current text', async () => {
    const state=freshState(), config=settings({targets:['fr','de','zh']});
    const requests:{target:string;items:ProviderItem[]}[]=[];
    const offline=new DemoProvider(0);
    const result=await translate(state,'locate-demo',config,undefined,{translate:async(items,target)=>{
      requests.push({target,items});return offline.translate(items,target);
    }});
    const job=result.jobs[0];
    expect(requests.reduce((sum,request)=>sum+request.items.length,0)).toBe(previewTranslation(state.drawings,{drawingIds:['locate-demo']},config.targets).total);
    expect(job.targets).toEqual(['fr','de','zh']); expect(job.files).toHaveLength(3);
    expect(job.total).toBe(15); expect(job.processed).toBe(15);
    expect(new Set(job.files.map(f=>f.outputId)).size).toBe(3);
    expect(job.files.every(f=>f.processed===5)).toBe(true);
    expect(requests.map(c=>c.target)).toEqual(['fr','de','zh']);
    expect(requests.every(c=>c.items.every(i=>i.text==='FIRE PUMP ROOM'&&i.sourceLanguage==='en'))).toBe(true);
    expect(result.drawings.find(d=>d.id==='locate-demo')).toEqual(state.drawings.find(d=>d.id==='locate-demo'));
    for(const target of config.targets){
      const output=result.drawings.find(d=>d.id===job.files.find(f=>f.target===target)!.outputId)!;
      const rows=job.rows.filter(r=>r.target===target);
      expect(rows).toHaveLength(5);
      expect(rows.every(r=>r.outputDrawingId===output.id)).toBe(true);
      expect(rows[0].translation).toBe(output.objects[0].text);
      expect(output.objects[0].language).toBe(target);
      expect(rows[2].status).toBe('Failed'); expect(rows[3].status).toBe('Skipped');
    }
    const fr=result.drawings.find(d=>d.language==='fr')!;
    const edited=editObject(result.drawings,fr.id,fr.objects[0].id,'MANUAL FRENCH');
    expect(edited.find(d=>d.language==='de')!.objects[0].text).toBe('FEUERLÖSCHPUMPENRAUM');
    expect(jobTargetLabel(job)).toContain('French, German');
  });
  it('isolates a failing language and continues to later languages without changing the input snapshot', async () => {
    const state=freshState(), config=settings({targets:['fr','de','zh']});
    state.drawings[0].objects[0].width=300;
    const result=await translate(state,'level-01',config,['txt-001'],{
      translate:async(items,target)=>{if(target==='de')throw new Error('German service failure');return items.map(i=>({id:i.id,text:target==='fr'?'FRENCH SUCCESS':'中文成功'}));},
    });
    expect(result.jobs[0].rows.map(r=>r.status)).toEqual(['Translated','Failed','Translated']);
    expect(result.jobs[0].files.map(f=>f.status)).toEqual(['Complete','Failed','Complete']);
    expect(result.drawings.find(d=>d.language==='fr')!.objects[0].text).toBe('FRENCH SUCCESS');
    expect(result.drawings.find(d=>d.language==='de')!.objects[0].text).toBe('FIRE PUMP ROOM');
    expect(result.drawings[0].objects[0].text).toBe('FIRE PUMP ROOM');
  });
  it('tracks the same source drawing and object separately for every output in a batch', async () => {
    const state=freshState(), config=settings({targets:['fr','de']});
    const prepared=prepareJob(state,{drawingIds:['level-01','site'],selection:['txt-001']},config);
    const result=await runJob(prepared.state,prepared.jobId,prepared.decisions,config,new DemoProvider(0),()=>{});
    expect(result.jobs[0].total).toBe(4); expect(result.jobs[0].processed).toBe(4);
    expect(result.jobs[0].files.every(f=>f.total===1&&f.processed===1&&f.status==='Complete')).toBe(true);
    expect(new Set(result.jobs[0].rows.map(r=>r.outputDrawingId)).size).toBe(4);
  });
  it('preserves partial multi-language output and recovers pending languages without restarting requests', async () => {
    const state=freshState(), config=settings({targets:['fr','de']});
    const prepared=prepareJob(state,{drawingIds:['locate-demo']},config);
    let partial='';
    await runJob(prepared.state,prepared.jobId,prepared.decisions,config,new DemoProvider(0),current=>{
      const job=current.jobs[0];
      if(!partial&&job.files[0].processed===5&&job.files[1].status==='Waiting')partial=JSON.stringify(current);
    });
    const recovered=restoreState(partial), job=recovered.jobs[0];
    expect(job.status).toBe('Interrupted'); expect(job.targets).toEqual(['fr','de']);
    const fr=recovered.drawings.find(d=>d.id===job.files[0].outputId)!;
    expect(fr.objects[0].text).toBe('LOCAL DES POMPES INCENDIE');
    expect(job.rows.filter(r=>r.target==='de'&&r.reason.startsWith('Interrupted'))).toHaveLength(3);
    const de=recovered.drawings.find(d=>d.id===job.files[1].outputId)!;
    expect(de.objects.every(o=>o.text==='FIRE PUMP ROOM')).toBe(true);
    expect(restoreState(JSON.stringify(recovered))).toEqual(recovered);
  });
  it('rejects invalid output combinations and collapses duplicate languages before creating files', () => {
    const state=freshState(), scope={drawingIds:['level-01']};
    expect(()=>prepareJob(state,scope,settings({targets:[]}))).toThrow('target language');
    expect(()=>prepareJob(state,scope,settings({targets:['fr','de'],output:'same'}))).toThrow('separate translated copies');
    const prepared=prepareJob(state,scope,settings({targets:['fr','fr']}));
    expect(prepared.state.jobs[0].files).toHaveLength(1);
    expect(prepared.state.jobs[0].targets).toEqual(['fr']);
  });
  it('keeps old single-target reports readable without changing their snapshots', () => {
    const old=legacyFixture(), restored=restoreState(JSON.stringify(old));
    expect(jobTargetLabel(restored.jobs[0])).toBe('French');
    expect(restored.jobs[0].rows[0].translation).toBe('OLD TRANSLATION');
  });
});
