import type { Decision, Job, PersistedState, ReportRow, Scope, Settings, TranslationProvider, ProviderResult } from './types';
import { assembleSegments, createCopy, measureOverflow, preview, splitGlossaryText, uid } from './core';

export function prepareJob(state: PersistedState, scope: Scope, settings: Settings): { state: PersistedState; jobId: string; decisions: Decision[] } {
  const decisions = preview(state.drawings, scope, settings, state.glossary);
  const drawings = [...state.drawings];
  const outputIds = new Map<string, string>();
  for (const source of state.drawings.filter(d => scope.drawingIds.includes(d.id))) {
    if (settings.output === 'copy') {
      const copy = createCopy(source, settings.target, drawings);
      drawings.push(copy); outputIds.set(source.id, copy.id);
    } else outputIds.set(source.id, source.id);
  }
  const job: Job = {
    id: uid(), startedAt: new Date().toISOString(), target: settings.target, provider: settings.provider,
    status: 'Running', total: decisions.length, processed: 0,
    files: state.drawings.filter(d => scope.drawingIds.includes(d.id)).map(d => ({ sourceId: d.id, outputId: outputIds.get(d.id)!, name: drawings.find(o => o.id === outputIds.get(d.id))!.name, total: decisions.filter(x => x.drawing.id === d.id).length, processed: 0, status: 'Waiting' })),
    rows: decisions.map(d => ({ id: uid(), sourceDrawingId: d.drawing.id, outputDrawingId: outputIds.get(d.drawing.id)!, drawingName: drawings.find(o => o.id === outputIds.get(d.drawing.id))!.name, objectId: d.object.id, type: d.object.type, layer: d.object.layer, original: d.object.sourceText, translation: d.object.translations[settings.target] ?? '', status: d.status ?? 'Skipped', reason: d.eligible ? 'Waiting for translation' : d.reason, target: settings.target })),
  };
  return { state: { ...state, drawings, jobs: [job, ...state.jobs].slice(0, 20) }, jobId: job.id, decisions };
}

// Publish after every batch; the caller persists each published snapshot.
export async function runJob(initial: PersistedState, jobId: string, decisions: Decision[], settings: Settings, provider: TranslationProvider, publish: (state: PersistedState) => void): Promise<PersistedState> {
  let state = initial;
  const update = (transform: (job: Job) => Job) => {
    state = { ...state, jobs: state.jobs.map(j => j.id === jobId ? transform(j) : j) };
    publish(state);
  };
  const job = () => state.jobs.find(j => j.id === jobId)!;
  const settleFile = (sourceId: string) => {
    update(j => {
      const rows = j.rows.filter(r => r.sourceDrawingId === sourceId);
      const errors = rows.filter(r => r.status === 'Failed').length;
      const successful = rows.some(r => ['Translated', 'Warning', 'Unchanged'].includes(r.status));
      return { ...j, files: j.files.map(f => f.sourceId !== sourceId ? f : { ...f, processed: f.total, status: errors && !successful ? 'Failed' : errors || rows.some(r => r.status === 'Warning') ? 'Warning' : 'Complete' }) };
    });
  };
  for (const file of job().files) {
    const eligible = decisions.filter(d => d.drawing.id === file.sourceId && d.eligible);
    const excluded = decisions.filter(d => d.drawing.id === file.sourceId && !d.eligible).length;
    update(j => ({ ...j, processed: j.processed + excluded, files: j.files.map(f => f.sourceId !== file.sourceId ? f : { ...f, status: 'Running', processed: excluded }) }));
    for (let start = 0; start < eligible.length; start += 5) {
      const batch = eligible.slice(start, start + 5);
      const plans = batch.map(d => ({ decision: d, segments: splitGlossaryText(d.object.sourceText, state.glossary, settings.target) }));
      const items = plans.flatMap(p => p.segments.flatMap((s, index) => s.kind === 'translate' ? [{ id: p.decision.object.id + ':part:' + index, text: s.text }] : []));
      const results: ProviderResult[] = [];
      // Limit API payloads to five text pieces, even when one object has several glossary terms.
      for (let offset = 0; offset < items.length; offset += 5) {
        const request = items.slice(offset, offset + 5);
        try { results.push(...await provider.translate(request, settings.target)); }
        catch (error) { results.push(...request.map(i => ({ id: i.id, error: error instanceof Error ? error.message : 'Translation service error' }))); }
      }
      const patches = new Map<string, Partial<ReportRow>>();
      const translated = new Map<string, string>();
      plans.forEach(({ decision, segments }) => {
        const parts = new Map<number, string>();
        let text: string;
        try {
          segments.forEach((segment, index) => {
            if (segment.kind !== 'translate') return;
            const result = results.find(r => r.id === decision.object.id + ':part:' + index);
            if (result?.error || !result?.text?.trim()) throw new Error(result?.error ?? 'MT API response missing this text segment');
            parts.set(index, result.text);
          });
          text = assembleSegments(segments, parts);
          if (!text.trim()) throw new Error('Translation is empty');
        } catch (error) {
          patches.set(decision.object.id, { status: 'Failed', reason: error instanceof Error ? error.message : 'Translation service error' }); return;
        }
        translated.set(decision.object.id, text);
        const overflow = measureOverflow(decision.object, text);
        const service = settings.provider === 'gemini' ? 'MT API' : 'Offline MT simulation';
        const reason = !parts.size ? 'Preferred translation from glossary; applied locally without MT API'
          : text === decision.object.sourceText ? service + ' returned the submitted text unchanged'
          : segments.some(s => s.kind === 'protected' || s.kind === 'preferred') ? service + ' translated surrounding text; glossary terms kept locally'
          : service + ' translation stored successfully';
        patches.set(decision.object.id, { translation: text, status: text === decision.object.sourceText ? 'Unchanged' : overflow ? 'Warning' : 'Translated', reason: overflow && text !== decision.object.sourceText ? 'Translated text may exceed original text bounds; ' + reason : reason });
      });
      state = { ...state, drawings: state.drawings.map(d => d.id !== file.outputId ? d : { ...d, objects: d.objects.map(o => !translated.has(o.id) || o.locked ? o : { ...o, translations: { ...o.translations, [settings.target]: translated.get(o.id)! } }) }) };
      update(j => ({ ...j, processed: j.processed + batch.length,
        rows: j.rows.map(r => r.sourceDrawingId === file.sourceId && patches.has(r.objectId) ? { ...r, ...patches.get(r.objectId) } : r),
        files: j.files.map(f => f.sourceId !== file.sourceId ? f : { ...f, processed: f.processed + batch.length }),
      }));
    }
    settleFile(file.sourceId);
  }
  update(j => ({ ...j, status: 'Complete', completedAt: new Date().toISOString() }));
  return state;
}
