import type { Decision, Job, Language, PersistedState, ReportRow, Scope, Settings, TranslationProvider } from './types';
import { assessScope, createCopy, isLanguage, measureOverflow, OVERFLOW_REASON, uid } from './core';

export function prepareJob(state: PersistedState, scope: Scope, settings: Settings): { state: PersistedState; jobId: string; decisions: Decision[] } {
  if (state.jobs.some(j => j.status === 'Running')) throw new Error('A translation job is already running');
  const targets = [...new Set(settings.targets)];
  if (!targets.length || targets.some(target => !isLanguage(target))) throw new Error('Choose at least one supported target language');
  if (settings.output === 'same' && targets.length > 1) throw new Error('Multiple target languages require separate translated copies');
  const decisions = targets.flatMap(target => assessScope(state.drawings, scope, target));
  const drawings = [...state.drawings];
  const outputIds = new Map<string, string>();
  const sources = state.drawings.filter(d => scope.drawingIds.includes(d.id));
  const key = (sourceId: string, target: string) => sourceId + ':' + target;
  for (const target of targets) for (const source of sources) {
    if (settings.output === 'copy') {
      const copy = createCopy(source, target, drawings);
      drawings.push(copy); outputIds.set(key(source.id, target), copy.id);
    } else outputIds.set(key(source.id, target), source.id);
  }
  const output = (sourceId: string, target: string) => drawings.find(d => d.id === outputIds.get(key(sourceId, target)))!;
  const job: Job = {
    id: uid(), startedAt: new Date().toISOString(), target: targets[0], targets, provider: settings.provider,
    status: 'Running', total: decisions.length, processed: 0,
    files: targets.flatMap(target => sources.map(d => {
      const scoped = decisions.filter(x => x.drawing.id === d.id && x.target === target);
      return { sourceId: d.id, outputId: output(d.id, target).id, name: output(d.id, target).name, target,
        sourceLanguages: [...new Set(scoped.map(x => x.object.language))],
        total: scoped.length, processed: 0, status: 'Waiting' as const };
    })),
    rows: decisions.map(d => ({
      id: uid(), sourceDrawingId: d.drawing.id, outputDrawingId: output(d.drawing.id, d.target).id, drawingName: output(d.drawing.id, d.target).name,
      objectId: d.object.id, type: d.object.type, layer: d.object.layer, original: d.object.text, sourceLanguage: d.object.language,
      translation: d.object.text, status: d.status ?? 'Skipped',
      reason: d.eligible ? 'Waiting for translation' : d.reason, target: d.target,
    })),
  };
  return { state: { ...state, drawings, jobs: [job, ...state.jobs] }, jobId: job.id, decisions };
}

// Each output uses the same input snapshot; translating one language cannot change another language's source.
export async function runJob(initial: PersistedState, jobId: string, decisions: Decision[], settings: Settings,
  provider: TranslationProvider, publish: (state: PersistedState) => void,
  overflowCheck = measureOverflow): Promise<PersistedState> {
  let state = initial;
  const update = (transform: (job: Job) => Job) => {
    state = { ...state, jobs: state.jobs.map(j => j.id === jobId ? transform(j) : j) };
    publish(state);
  };
  const job = () => state.jobs.find(j => j.id === jobId)!;
  for (const file of job().files) {
    const target = file.target ?? job().target;
    const eligible = decisions.filter(d => d.drawing.id === file.sourceId && d.target === target && d.eligible);
    const excluded = decisions.filter(d => d.drawing.id === file.sourceId && d.target === target && !d.eligible);
    const excludedById = new Map(excluded.map(d => [d.object.id, d]));
    state = { ...state, drawings: state.drawings.map(d => d.id !== file.outputId ? d : {
      ...d, objects: d.objects.map(o => {
        const decision = excludedById.get(o.id);
        return decision ? { ...o, lastStatus: decision.status, lastReason: decision.reason } : o;
      }),
    }) };
    update(j => ({ ...j, processed: j.processed + excluded.length,
      files: j.files.map(f => f.outputId !== file.outputId ? f : { ...f, status: 'Running', processed: excluded.length }) }));
    const bySource = new Map<Language, Decision[]>();
    for (const decision of eligible) {
      const items = bySource.get(decision.object.language) ?? [];
      items.push(decision); bySource.set(decision.object.language, items);
    }
    for (const group of bySource.values()) {
      for (let start = 0; start < group.length; start += 5) {
        const batch = group.slice(start, start + 5);
        const items = batch.map(d => ({
          id: file.sourceId + ':' + d.object.id, objectId: d.object.id,
          text: d.object.text, sourceLanguage: d.object.language,
        }));
        let results;
        try { results = await provider.translate(items, target); }
        catch (error) { results = items.map(i => ({ id: i.id, error: error instanceof Error ? error.message : 'Translation service error' })); }
        const patches = new Map<string, Partial<ReportRow>>();
        const writes = new Map<string, string>();
        batch.forEach((decision, index) => {
          const result = results.find(r => r.id === items[index].id);
          if (!result || result.error || !('text' in result) || !result.text?.trim()) {
            patches.set(decision.object.id, { status: 'Failed', reason: result?.error ?? 'MT API response missing this object' }); return;
          }
          const text = result.text;
          const sameText = text === decision.object.text;
          if (!sameText) writes.set(decision.object.id, text);
          const overflow = !sameText && overflowCheck(decision.object, text);
          const service = settings.provider === 'gemini' ? 'MT API' : 'Offline MT simulation';
          const reason = sameText ? service + ' returned the submitted text unchanged' : service + ' translation stored successfully';
          patches.set(decision.object.id, {
            translation: text, status: sameText ? 'Skipped' : overflow ? 'Warning' : 'Translated',
            reason: overflow ? OVERFLOW_REASON : reason,
          });
        });
        state = { ...state, drawings: state.drawings.map(d => d.id !== file.outputId ? d : {
          ...d, language: writes.size ? target : d.language,
          objects: d.objects.map(o => {
            const patch = patches.get(o.id);
            if (!patch) return o;
            return { ...o, ...(writes.has(o.id) && !o.locked ? { text: writes.get(o.id)!, language: target } : {}),
              lastStatus: patch.status, lastReason: patch.reason };
          }),
        }) };
        update(j => ({ ...j, processed: j.processed + batch.length,
          rows: j.rows.map(r => r.outputDrawingId === file.outputId && patches.has(r.objectId) ? { ...r, ...patches.get(r.objectId) } : r),
          files: j.files.map(f => f.outputId !== file.outputId ? f : { ...f, processed: f.processed + batch.length }),
        }));
      }
    }
    update(j => {
      const rows = j.rows.filter(r => r.outputDrawingId === file.outputId);
      const failed = rows.some(r => r.status === 'Failed');
      const successful = rows.some(r => ['Translated', 'Warning'].includes(r.status));
      return { ...j, files: j.files.map(f => f.outputId !== file.outputId ? f : {
        ...f, processed: f.total, status: failed && !successful ? 'Failed' : failed || rows.some(r => r.status === 'Warning') ? 'Warning' : 'Complete',
      }) };
    });
  }
  update(j => ({ ...j, status: 'Complete', completedAt: new Date().toISOString() }));
  return state;
}
