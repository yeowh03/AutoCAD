import { describe, expect, it } from 'vitest';
import { assembleSegments, createCopy, defaultSettings, editObject, freshState, instances, preview, restoreState, splitGlossaryText, validatePatterns } from './core';
import { prepareJob, runJob } from './jobs';
import { DemoProvider } from './providers';

describe('translation scope and safety', () => {
  it('seeds four independently addressable drawings with all required object types', () => {
    const state = freshState();
    expect(state.drawings).toHaveLength(4);
    for (const drawing of state.drawings) {
      expect(drawing.objects.length).toBeGreaterThanOrEqual(15);
      expect(drawing.objects.length).toBeLessThanOrEqual(30);
      expect(new Set(drawing.objects.map(o=>o.id)).size).toBe(drawing.objects.length);
    }
    expect(new Set(state.drawings.flatMap(d=>d.objects.map(o=>o.type))).size).toBe(7);
  });
  it('partitions every detected object and reports precise exclusion and lock reasons', () => {
    const state = freshState(), settings = defaultSettings(state.drawings,'demo');
    const decisions = preview(state.drawings,{drawingIds:state.drawings.map(d=>d.id)},settings,state.glossary);
    expect(decisions).toHaveLength(104);
    expect(decisions.filter(d=>d.eligible).length+decisions.filter(d=>!d.eligible).length).toBe(104);
    expect(decisions.some(d=>d.reason==='Numeric-only text')).toBe(false); // Dimension type is excluded first.
    expect(decisions.some(d=>d.reason==='Dimension / level string')).toBe(true);
    expect(decisions.some(d=>d.reason==='Drawing reference / short code')).toBe(true);
    expect(decisions.filter(d=>d.status==='Failed')).toHaveLength(4);
    expect(decisions.filter(d=>d.reason==='Object type not supported')).toHaveLength(4);
  });
  it('restricts selection to its drawing even when IDs repeat in other files', () => {
    const state=freshState();
    const rows=preview(state.drawings,{drawingIds:['mechanical'],selection:['txt-001','txt-002','txt-003']},defaultSettings(state.drawings,'demo'),state.glossary);
    expect(rows).toHaveLength(3);expect(rows.every(d=>d.drawing.id==='mechanical'&&d.eligible)).toBe(true);
  });
  it('applies type, layer, numeric, and custom filters and rejects unsafe patterns', () => {
    const state=freshState(), settings=defaultSettings(state.drawings,'demo');
    settings.types.push('Dimension');settings.patterns=['^FIRE'];settings.layers=['A-ANNO-NOTE','A-ANNO-DIMS'];
    const rows=preview(state.drawings,{drawingIds:['level-01']},settings,state.glossary);
    expect(rows.some(r=>r.reason==='Excluded by layer filter')).toBe(true);
    expect(rows.some(r=>r.reason==='Excluded by custom pattern')).toBe(true);
    expect(rows.some(r=>r.reason==='Numeric-only text')).toBe(true);
    expect(validatePatterns(['['])).toContain('Invalid');expect(validatePatterns(['(a+)+'])).toContain('Nested');
    expect(validatePatterns(['^REV\\s'])).toBeUndefined();
  });
  it('keeps longest matches, exact spelling, repeated terms, whitespace and preferred values local', () => {
    const entries=freshState().glossary;
    entries.push({id:'preferred',kind:'preferred',source:'Fire Pump Room',target:'LOCAL PROJET',language:'fr'});
    const segments=splitGlossaryText('INSTALL AHU-01 IN FIRE PUMP ROOM / AHU / ahu-01',entries,'fr');
    expect(segments.filter(s=>s.kind==='protected')).toHaveLength(3);
    expect(segments.filter(s=>s.kind==='translate').map(s=>s.text)).toEqual(['INSTALL','IN']);
    expect(assembleSegments(segments,new Map(segments.flatMap((s,i)=>s.kind==='translate'?[[i,s.text] as const]:[])))).toBe('INSTALL AHU-01 IN LOCAL PROJET / AHU / ahu-01');
    expect(splitGlossaryText('AHUMAN',entries,'fr').some(s=>s.kind==='protected')).toBe(false);
    expect(()=>assembleSegments(segments,new Map())).toThrow('surrounding segment');
  });
  it('creates independent copies with safe names and keeps source objects intact', () => {
    const state=freshState(), source=state.drawings[0];
    const copy=createCopy(source,'fr',state.drawings);
    const second=createCopy(source,'fr',[...state.drawings,copy]);
    expect(copy.name).toBe('Level_01_FR.dwg');expect(second.name).toBe('Level_01_FR_2.dwg');
    expect(copy.folder).toBe('Translations/FR/');
    copy.objects[0].translations.fr='edited';expect(source.objects[0].translations.fr).toBeUndefined();
  });
  it('preserves manual target edits and invalidates translations after source edits', () => {
    let state=freshState();
    state.drawings=editObject(state.drawings,'level-01','txt-001','fr','MANUAL');
    expect(editObject(state.drawings,'level-01','txt-001','en',state.drawings[0].objects[0].sourceText)[0].objects[0].translations.fr).toBe('MANUAL');
    const settings=defaultSettings(state.drawings,'demo');
    expect(preview(state.drawings,{drawingIds:['level-01']},settings,state.glossary)[0].reason).toBe('Existing translation preserved; not sent to MT API');
    settings.replaceExisting=true;expect(preview(state.drawings,{drawingIds:['level-01']},settings,state.glossary)[0].eligible).toBe(true);
    state.drawings=editObject(state.drawings,'level-01','txt-001','en','SOURCE CHANGED');
    expect(state.drawings[0].objects[0].translations).toEqual({});
    const locked=state.drawings[0].objects.find(o=>o.locked)!;
    expect(editObject(state.drawings,'level-01',locked.id,'en','WRONG')[0].objects.find(o=>o.id===locked.id)?.sourceText).toBe(locked.sourceText);
  });
});

describe('jobs, report references, and recovery',()=>{
  it('retains successful items after failure and reconciles per-file progress',async()=>{
    const state=freshState(), settings=defaultSettings(state.drawings,'demo');
    const prepared=prepareJob(state,{drawingIds:['mechanical']},settings);
    const snapshots:string[]=[];
    const result=await runJob(prepared.state,prepared.jobId,prepared.decisions,settings,new DemoProvider(0),s=>snapshots.push(JSON.stringify(s)));
    const job=result.jobs[0];
    expect(job.status).toBe('Complete');expect(job.processed).toBe(job.total);expect(job.files[0].processed).toBe(job.files[0].total);
    expect(job.rows.find(r=>r.original==='VERIFY DUCT CONNECTION')?.status).toBe('Failed');
    expect(result.drawings.find(d=>d.id==='mechanical')!.objects[0].translations.fr).toContain('AHU-01');
    expect(result.drawings.find(d=>d.id==='mechanical')!.objects.find(o=>o.locked)!.translations.fr).toBeUndefined();
    expect(snapshots.length).toBeGreaterThan(3);
    expect(job.rows.every(r=>result.drawings.find(d=>d.id===r.outputDrawingId)?.objects.some(o=>o.id===r.objectId))).toBe(true);
  });
  it('writes selection results only into the requested copy',async()=>{
    const state=freshState(),settings={...defaultSettings(state.drawings,'demo'),output:'copy' as const};
    const prepared=prepareJob(state,{drawingIds:['site'],selection:['txt-001','txt-002']},settings);
    const result=await runJob(prepared.state,prepared.jobId,prepared.decisions,settings,new DemoProvider(0),()=>{});
    const source=result.drawings.find(d=>d.id==='site')!,copy=result.drawings.find(d=>d.copiedFrom==='site')!;
    expect(source.objects.every(o=>!o.translations.fr)).toBe(true);
    expect(copy.objects.filter(o=>o.translations.fr!==undefined)).toHaveLength(2);
    expect(result.jobs[0].rows.every(r=>r.outputDrawingId===copy.id&&r.sourceDrawingId===source.id)).toBe(true);
  });
  it('supports all seeded natural language fixtures in each target language',async()=>{
    for(const target of ['fr','de','zh'] as const){
      const state=freshState(),settings={...defaultSettings(state.drawings,'demo'),target};
      const prepared=prepareJob(state,{drawingIds:state.drawings.map(d=>d.id)},settings);
      const result=await runJob(prepared.state,prepared.jobId,prepared.decisions,settings,new DemoProvider(0),()=>{});
      const failed=result.jobs[0].rows.filter(r=>r.status==='Failed');
      expect(failed).toHaveLength(5); // Four locked objects and one simulated service failure.
    }
  });
  it('round-trips persisted state and marks pending work interrupted without dropping prior output',()=>{
    const state=freshState(),settings=defaultSettings(state.drawings,'demo');
    state.drawings[0].objects[0].translations.fr='PRESERVED';
    const prepared=prepareJob(state,{drawingIds:['level-01','level-02']},settings);
    const restored=restoreState(JSON.stringify(prepared.state));
    expect(restored.jobs[0].status).toBe('Interrupted');
    expect(restored.jobs[0].rows.some(r=>r.reason.includes('Interrupted by page reload'))).toBe(true);
    expect(restored.drawings[0].objects[0].translations.fr).toBe('PRESERVED');
    expect(restoreState('corrupt').drawings).toHaveLength(4);
    expect(restoreState(JSON.stringify({...state,version:999})).drawings).toHaveLength(4);
  });
  it('finds repeated source instances across drawings',()=>{
    const state=freshState(),prepared=prepareJob(state,{drawingIds:['level-01','level-02']},defaultSettings(state.drawings,'demo'));
    const matches=instances(prepared.state.jobs[0].rows,'ffl 0.000');
    expect(matches).toHaveLength(4);expect(new Set(matches.map(r=>r.outputDrawingId)).size).toBe(2);
  });
  it('does not write a partial object when one surrounding piece fails',async()=>{
    const state=freshState();state.drawings[0].objects[0].sourceText='INSTALL AHU-01 ABOVE CEILING';state.drawings[0].objects[0].translations.fr='VALID';
    const settings={...defaultSettings(state.drawings,'gemini'),replaceExisting:true};
    const prepared=prepareJob(state,{drawingIds:['level-01'],selection:['txt-001']},settings);
    const result=await runJob(prepared.state,prepared.jobId,prepared.decisions,settings,{translate:async(items)=>items.map((item,index)=>index===0?{id:item.id,text:'INSTALLER'}:{id:item.id,error:'Service failure'})},()=>{});
    expect(result.jobs[0].rows[0].status).toBe('Failed');expect(result.drawings[0].objects[0].translations.fr).toBe('VALID');
  });
  it('distinguishes glossary-only skips from MT API returning natural text unchanged',async()=>{
    const state=freshState(),settings=defaultSettings(state.drawings,'gemini');
    const prepared=prepareJob(state,{drawingIds:['mechanical'],selection:['txt-004','txt-020']},settings);
    const requests:{id:string;text:string}[]=[];
    const result=await runJob(prepared.state,prepared.jobId,prepared.decisions,settings,{translate:async(items)=>{requests.push(...items);return items.map(i=>({id:i.id,text:i.text}));}},()=>{});
    expect(requests.map(i=>i.text)).toEqual(['RETURN AIR DUCT']);
    const glossary=result.jobs[0].rows.find(r=>r.original==='AHU-01')!;
    expect(glossary.status).toBe('Skipped');expect(glossary.reason).toBe('Listed in glossary (do not translate); not sent to MT API');
    const service=result.jobs[0].rows.find(r=>r.original==='RETURN AIR DUCT')!;
    expect(service.status).toBe('Unchanged');expect(service.reason).toBe('MT API returned the submitted text unchanged');
  });
  it('makes no MT requests when all selected text is protected by the glossary',async()=>{
    const state=freshState(),settings=defaultSettings(state.drawings,'gemini');
    const prepared=prepareJob(state,{drawingIds:['mechanical'],selection:['txt-020','txt-024']},settings);
    let calls=0;
    const result=await runJob(prepared.state,prepared.jobId,prepared.decisions,settings,{translate:async()=>{calls++;return[];}},()=>{});
    expect(calls).toBe(0);expect(result.jobs[0].rows.every(r=>r.status==='Skipped'&&r.reason.includes('Listed in glossary'))).toBe(true);
  });
  it('does not send protected or preferred terms and applies preferred-only text without MT',async()=>{
    const state=freshState(),settings=defaultSettings(state.drawings,'gemini');
    state.glossary.push({id:'pref',kind:'preferred',source:'Fire Pump Room',target:'PROJECT ROOM',language:'fr'});
    const prepared=prepareJob(state,{drawingIds:['mechanical'],selection:['txt-001','txt-002','txt-011']},settings);
    const requests:{id:string;text:string}[]=[];
    const result=await runJob(prepared.state,prepared.jobId,prepared.decisions,settings,{translate:async(items)=>{requests.push(...items);return items.map(i=>({id:i.id,text:'TRANSLATED'}));}},()=>{});
    expect(requests.map(i=>i.text)).toEqual(['INSTALL','ABOVE CEILING','CONNECT','TO','SYSTEM']);
    expect(requests.every(i=>!/(AHU|DN100|HVAC|FIRE PUMP ROOM)/i.test(i.text))).toBe(true);
    expect(result.drawings.find(d=>d.id==='mechanical')!.objects[0].translations.fr).toBe('TRANSLATED AHU-01 TRANSLATED');
    expect(result.drawings.find(d=>d.id==='mechanical')!.objects[1].translations.fr).toBe('TRANSLATED DN100 TRANSLATED HVAC TRANSLATED');
    expect(result.drawings.find(d=>d.id==='mechanical')!.objects[10].translations.fr).toBe('PROJECT ROOM');
    expect(result.jobs[0].rows.find(r=>r.original==='FIRE PUMP ROOM')!.reason).toContain('applied locally without MT API');
  });
  it('bounds requests to five segments and joins objects spanning multiple requests',async()=>{
    const state=freshState(),settings=defaultSettings(state.drawings,'gemini');
    const original=Array.from({length:7},()=> 'INSTALL AHU-01 ABOVE CEILING').join(' / ');
    state.drawings[0].objects[0].sourceText=original;
    const prepared=prepareJob(state,{drawingIds:['level-01'],selection:['txt-001']},settings);
    const sizes:number[]=[];
    const result=await runJob(prepared.state,prepared.jobId,prepared.decisions,settings,{translate:async(items)=>{sizes.push(items.length);return items.map(i=>({id:i.id,text:i.text}));}},()=>{});
    expect(sizes).toEqual([5,3]);
    expect(result.drawings[0].objects[0].translations.fr).toBe(original);
    expect(result.jobs[0].rows[0].status).toBe('Unchanged');
  });
});
