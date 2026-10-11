import { describe, expect, it, vi } from 'vitest';
import { LANGUAGES, LANGUAGE_OPTIONS, searchLanguages } from './languages';
import { createCopy, defaultSettings, freshState, isLanguage, restoreState, searchDrawingFiles } from './core';
import { prepareJob, runJob } from './jobs';
import { DemoProvider, GeminiProvider } from './providers';

describe('global language catalogue and search', () => {
  it('includes registered global languages, script choices and safe output suffixes', () => {
    expect(LANGUAGE_OPTIONS.length).toBeGreaterThan(7000);
    expect(new Set(LANGUAGE_OPTIONS.map(language=>language.code)).size).toBe(LANGUAGE_OPTIONS.length);
    for(const code of ['en','es','ja','ar','hi','ta','yue','aoz','zh','zh-Hant'])expect(isLanguage(code)).toBe(true);
    expect(isLanguage('__proto__')).toBe(false); expect(isLanguage('not-a-language')).toBe(false);
    expect(LANGUAGE_OPTIONS.every(language=>/^[A-Z]{2,3}(?:-[A-Z]+)?$/.test(language.suffix))).toBe(true);
    expect(createCopy(freshState().drawings[0],'zh-Hant',[]).name).toBe('Level_01_ZH-HANT.dwg');
  });
  it('searches native names, aliases and codes without case or accent sensitivity', () => {
    expect(searchLanguages('español')[0].code).toBe('es');
    expect(searchLanguages('ESPANOL')[0].code).toBe('es');
    expect(searchLanguages('francais')[0].code).toBe('fr');
    expect(searchLanguages('العربية').some(language=>language.code==='ar')).toBe(true);
    expect(searchLanguages('ja')[0].code).toBe('ja');
    expect(searchLanguages('Castilian').some(language=>language.code==='es')).toBe(true);
    expect(searchLanguages('Cantonese')[0].code).toBe('yue');
    expect(searchLanguages('Uab Meto')[0].code).toBe('aoz');
    expect(searchLanguages('zzzz-no-language')).toHaveLength(0);
    expect(searchLanguages('')).toHaveLength(LANGUAGE_OPTIONS.length);
  });
  it('filters filenames while keeping the input drawing records independent of search state', () => {
    const drawings=freshState().drawings;
    expect(searchDrawingFiles(drawings,' MECHANICAL ').map(d=>d.id)).toEqual(['mechanical']);
    expect(searchDrawingFiles(drawings,'site plan').map(d=>d.id)).toEqual(['site']);
    expect(searchDrawingFiles(drawings,'level 02').map(d=>d.id)).toEqual(['level-02']);
    expect(searchDrawingFiles(drawings,'no-match')).toHaveLength(0);
    expect(searchDrawingFiles(drawings,'')).toHaveLength(5);
    expect(drawings).toHaveLength(5);
  });
  it('accepts global targets and preserves saved drawings and reports', async () => {
    const state=freshState(), settings={...defaultSettings('gemini'),targets:['es','ja','ar']};
    const scope={drawingIds:['level-01'],selection:['txt-001']};
    const prepared=prepareJob(state,scope,settings);
    const calls:string[]=[];
    const result=await runJob(prepared.state,prepared.jobId,prepared.decisions,settings,{translate:async(items,target)=>{
      calls.push(target);return items.map(item=>({id:item.id,text:LANGUAGES[target].name+' RESULT'}));
    }},()=>{});
    expect(calls).toEqual(settings.targets);
    for(const target of settings.targets){
      const row=result.jobs[0].rows.find(row=>row.target===target)!;
      const copy=result.drawings.find(d=>d.id===row.outputDrawingId)!;
      expect(copy.language).toBe(target); expect(copy.objects[0].language).toBe(target);
      expect(copy.objects[0].text).toBe(LANGUAGES[target].name+' RESULT');
    }
    expect(result.drawings[0].objects[0].text).toBe('FIRE PUMP ROOM');
    expect(restoreState(JSON.stringify(result))).toEqual(result);
    expect(()=>prepareJob(state,scope,{...settings,targets:['unknown-code']})).toThrow('target language');
  });
  it('can translate a known French fixture back to English as an independent English file', async () => {
    const state=freshState(); state.drawings[0].language='fr';
    state.drawings[0].objects[0].text='LOCAL DES POMPES INCENDIE'; state.drawings[0].objects[0].language='fr';
    const settings={...defaultSettings('demo'),targets:['en']};
    const prepared=prepareJob(state,{drawingIds:['level-01'],selection:['txt-001']},settings);
    const result=await runJob(prepared.state,prepared.jobId,prepared.decisions,settings,new DemoProvider(0),()=>{});
    const copy=result.drawings.at(-1)!;
    expect(copy.name).toBe('Level_01_EN.dwg'); expect(copy.language).toBe('en');
    expect(copy.objects[0].text).toBe('FIRE PUMP ROOM');
    expect(result.drawings[0].objects[0].text).toBe('LOCAL DES POMPES INCENDIE');
  });
  it('uses global source and target names in Gemini requests',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({candidates:[{content:{parts:[{text:'[{"id":"a","text":"消防ポンプ室"}]'}]}}]})));
    await new GeminiProvider('key','test-model',fetcher).translate([{id:'a',text:'SALA DE BOMBAS',sourceLanguage:'es'}],'ja');
    expect(JSON.parse(String(fetcher.mock.calls[0][1]!.body)).systemInstruction.parts[0].text).toContain('Spanish to Japanese');
  });
  it('reports missing offline language fixtures instead of pretending the language was translated',async()=>{
    const result=await new DemoProvider(0).translate([
      {id:'a',text:'FIRE PUMP ROOM',sourceLanguage:'en'},
      {id:'b',objectId:'locate-demo-unchanged',text:'FIRE PUMP ROOM',sourceLanguage:'en'},
    ],'es');
    expect(result.every(item=>item.error?.includes('No offline fixtures for Spanish'))).toBe(true);
    expect(result.every(item=>!item.text)).toBe(true);
  });
});
