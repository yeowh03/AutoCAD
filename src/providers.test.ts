import { describe, expect, it, vi } from 'vitest';
import { DemoProvider, GeminiProvider, validateResponse } from './providers';
import type { ProviderItem } from './types';

const items:ProviderItem[]=[{id:'a',text:'FIRE PUMP ROOM'}];
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
    await expect(new GeminiProvider('key','model',fetcher,5,1).translate(items,'fr')).rejects.toThrow('timed out');
  });
  it('rejects malformed JSON and empty or blocked responses',async()=>{
    await expect(new GeminiProvider('key','model',vi.fn<typeof fetch>().mockResolvedValue(response('bad-json'))).translate(items,'fr')).rejects.toThrow('malformed');
    await expect(new GeminiProvider('key','model',vi.fn<typeof fetch>().mockResolvedValue(new Response('{}'))).translate(items,'fr')).rejects.toThrow('no translation');
  });
  it('rejects duplicate, missing, unexpected IDs and empty translated values',()=>{
    for(const invalid of [[{id:'wrong',text:'X'}],[],[{id:'a',text:'X'},{id:'a',text:'Y'}],[{id:'a',text:''}],{}])expect(()=>validateResponse(invalid,items)).toThrow();
  });
  it('translates standalone surrounding text pieces in offline mode',async()=>{
    const results=await new DemoProvider(0).translate([{id:'a',text:'INSTALL'},{id:'b',text:'ABOVE CEILING'},{id:'c',text:'SCREEN'}],'fr');
    expect(results.map(r=>r.text)).toEqual(['INSTALLER','AU-DESSUS DU PLAFOND','ÉCRAN']);
  });
  it('reports unknown edited content instead of pretending it was translated offline',async()=>{
    const result=await new DemoProvider(0).translate([{id:'a',text:'ELECTRICAL BANANA'}],'fr');expect(result[0].error).toContain('No offline fixture');
  });
});
