import { describe, expect, it, vi } from 'vitest';
import { DemoProvider, GeminiProvider, validateResponse } from './providers';
import type { ProviderItem } from './types';

const items:ProviderItem[]=[{id:'a',text:'FIRE PUMP ROOM',sourceLanguage:'en'}];
const response=(text:string)=>new Response(JSON.stringify({candidates:[{content:{parts:[{text}]}}]}),{status:200});
describe('Gemini simulation provider',()=>{
  it('sends plain text, model, key header and validates a structured result',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response('[{"id":"a","text":"LOCAL"}]'));
    expect(await new GeminiProvider('local-key','demo-model',fetcher).translate(items,'fr')).toEqual([{id:'a',text:'LOCAL'}]);
    expect(fetcher.mock.calls[0][0]).toContain('demo-model:generateContent');
    const request=fetcher.mock.calls[0][1]!;expect(request.headers).toHaveProperty('x-goog-api-key','local-key');
    const body=JSON.parse(String(request.body));expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(body.contents[0].parts[0].text).toContain('FIRE PUMP ROOM');
    expect(body.systemInstruction.parts[0].text).not.toMatch(/placeholder|preserve/i);
  });
  it('does not make requests when a key is absent',async()=>{
    const fetcher=vi.fn<typeof fetch>();await expect(new GeminiProvider('','model',fetcher).translate(items,'fr')).rejects.toThrow('missing');expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([401,403])('reports authentication failure %s without retry or demo fallback',async(status)=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('{}',{status}));
    await expect(new GeminiProvider('key','model',fetcher,100,1).translate(items,'fr')).rejects.toThrow('authentication');expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('retries rate limits once then returns the validated result',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{}',{status:429})).mockResolvedValueOnce(response('[{"id":"a","text":"LOCAL"}]'));
    expect(await new GeminiProvider('key','model',fetcher,100,1).translate(items,'fr')).toHaveLength(1);expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('stops after the bounded rate-limit retry',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response('{}',{status:429}));
    await expect(new GeminiProvider('key','model',fetcher,100,1).translate(items,'fr')).rejects.toThrow('rate limit');expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('retries a transient network failure once',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('Network')).mockResolvedValueOnce(response('[{"id":"a","text":"LOCAL"}]'));
    await expect(new GeminiProvider('key','model',fetcher,100,1).translate(items,'fr')).resolves.toHaveLength(1);expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('times out requests and reports the failure',async()=>{
    const fetcher=vi.fn<typeof fetch>((_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')))));
    await expect(new GeminiProvider('key','model',fetcher,5,1).translate(items,'fr')).rejects.toThrow('timed out'); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed JSON and empty or blocked responses',async()=>{
    await expect(new GeminiProvider('key','model',vi.fn<typeof fetch>().mockResolvedValue(response('bad-json'))).translate(items,'fr')).rejects.toThrow('malformed');
    await expect(new GeminiProvider('key','model',vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))).translate(items,'fr')).rejects.toThrow('no translation');
  });
  it('rejects duplicate, missing, unexpected IDs and empty translated values',()=>{
    for(const invalid of [[{id:'wrong',text:'X'}],[],[{id:'a',text:'X'},{id:'a',text:'Y'}],[{id:'a',text:''}],{}])expect(()=>validateResponse(invalid,items)).toThrow();
  });
  it('translates ordinary text in offline mode',async()=>{
    const results=await new DemoProvider(0).translate([{id:'a',text:'INSTALL',sourceLanguage:'en'},{id:'b',text:'ABOVE CEILING',sourceLanguage:'en'},{id:'c',text:'SCREEN',sourceLanguage:'en'}],'fr');
    expect(results.map(r=>r.text)).toEqual(['INSTALLER','AU-DESSUS DU PLAFOND','ÉCRAN']);
  });
  it('reports unknown edited content instead of pretending it was translated offline',async()=>{
    const result=await new DemoProvider(0).translate([{id:'a',text:'ELECTRICAL BANANA',sourceLanguage:'en'}],'fr');expect(result[0].error).toContain('No offline fixture');
  });
});

describe('single-language service contract', () => {
  it('uses the actual source language and sends whole text without object metadata', async () => {
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response('[{"id":"a","text":"PUMPENRAUM"}]'));
    await new GeminiProvider('key','model',fetcher).translate([{id:'a',text:'LOCAL DES POMPES INCENDIE',sourceLanguage:'fr',objectId:'locate-demo-unchanged'}],'de');
    const body=JSON.parse(String(fetcher.mock.calls[0][1]!.body));
    expect(body.systemInstruction.parts[0].text).toContain('French to German');
    expect(JSON.parse(body.contents[0].parts[0].text)).toEqual([{id:'a',text:'LOCAL DES POMPES INCENDIE'}]);
  });
  it('rejects mixed source batches before requesting MT', async () => {
    const fetcher=vi.fn<typeof fetch>();
    await expect(new GeminiProvider('key','model',fetcher).translate([
      {id:'a',text:'FIRE PUMP ROOM',sourceLanguage:'en'},{id:'b',text:'LOCAL DES POMPES INCENDIE',sourceLanguage:'fr'},
    ],'de')).rejects.toThrow('source language');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('scopes the unchanged offline fixture to the specific demo object', async () => {
    const result=await new DemoProvider(0).translate([
      {id:'a',objectId:'locate-demo-translated',text:'FIRE PUMP ROOM',sourceLanguage:'en'},
      {id:'b',objectId:'locate-demo-unchanged',text:'FIRE PUMP ROOM',sourceLanguage:'en'},
      {id:'c',objectId:'another-id',text:'FIRE PUMP ROOM',sourceLanguage:'en'},
    ],'fr');
    expect(result.map(r=>r.text)).toEqual(['LOCAL DES POMPES INCENDIE','FIRE PUMP ROOM','LOCAL DES POMPES INCENDIE']);
  });
  it('does not force the offline unchanged fixture into live Gemini output', async () => {
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response('[{"id":"a","text":"LOCAL LIVE"}]'));
    const result=await new GeminiProvider('key','model',fetcher).translate([{id:'a',objectId:'locate-demo-unchanged',text:'FIRE PUMP ROOM',sourceLanguage:'en'}],'fr');
    expect(result[0].text).toBe('LOCAL LIVE');
  });
  it('translates a known French fixture directly to German', async () => {
    const result=await new DemoProvider(0).translate([{id:'a',text:'LOCAL DES POMPES INCENDIE',sourceLanguage:'fr'}],'de');
    expect(result[0].text).toBe('FEUERLÖSCHPUMPENRAUM');
  });
});
