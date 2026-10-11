import type { Decision, Drawing, Job, Language, PersistedState, ReportRow, RowStatus, Scope, Settings, TargetLanguage, TextObject } from './types';
import { LANGUAGES, OBJECT_TYPES } from './types';
import { normalizeSearch } from './languages';
import level1 from './data/Level_01.json';
import level2 from './data/Level_02.json';
import mechanical from './data/Mechanical_Plan.json';
import site from './data/Site_Plan.json';
import locateDemo from './data/Locate_Demo.json';

export const STORAGE_KEY = 'cad-translate-studio-v2';
export const LEGACY_STORAGE_KEY = 'cad-translate-studio-v1';
export const OVERFLOW_REASON = 'Translated text may exceed original text bounds';
// Older warning rows appended a successful-save message for the same object.
export function reportReason(status: unknown, reason: string): string {
  return status === 'Warning' && /^Translated text may exceed original text bounds; (?:MT API|Offline MT simulation) translation stored successfully$/.test(reason)
    ? OVERFLOW_REASON : reason;
}
export const uid = () => crypto.randomUUID();
export const isLanguage = (value: unknown): value is Language => typeof value === 'string' && Object.hasOwn(LANGUAGES, value);
export function freshState(): PersistedState {
  return { version: 2, drawings: structuredClone([level1, level2, mechanical, site, locateDemo]) as Drawing[], jobs: [] };
}
export function defaultSettings(provider: Settings['provider']): Settings {
  return { targets: ['fr'], output: 'copy', provider };
}
export function assessScope(drawings: Drawing[], scope: Scope, target: TargetLanguage): Decision[] {
  return drawings.filter(d => scope.drawingIds.includes(d.id)).flatMap(drawing => drawing.objects
    .filter(o => !scope.selection || scope.selection.includes(o.id))
    .map(object => {
      const base = { drawing, object, target, eligible: false };
      const skip = (reason: string, status: Decision['status'] = 'Skipped'): Decision => ({ ...base, reason, status });
      const text = object.text.trim();
      if (!OBJECT_TYPES.includes(object.type as typeof OBJECT_TYPES[number])) return skip('Object type not supported');
      if (!['MText', 'DBText', 'MultiLeader', 'BlockAttribute'].includes(object.type)) return skip('Structured object type excluded automatically');
      if (!text || !/[\p{L}\p{N}]/u.test(text)) return skip('No translatable content');
      if (/^[+-]?[\d\s.,]+$/.test(text)) return skip('Numeric-only text excluded automatically');
      if (/^(?:(?:FFL|EL|RL|CL)\s*[+-]?\d|\d+(?:\.\d+)?\s*(?:mm|cm|m|ft|in)\b)/i.test(text)) return skip('Dimension / level string excluded automatically');
      if (/^(?:[A-Z]{1,5}[-.]?\d+(?:\.\d+)?|[A-Z]{1,5})$/.test(text)) return skip('Drawing reference / short code excluded automatically');
      if (object.locked) return skip('Object is on a locked layer', 'Failed');
      return { drawing, object, target, eligible: true, reason: '' };
    }));
}
export function searchDrawingFiles(drawings: Drawing[], query: string): Drawing[] {
  const tokens = normalizeSearch(query).replace(/[_-]/g, ' ').split(/\s+/).filter(Boolean);
  return drawings.filter(drawing => { const name = normalizeSearch(drawing.name).replace(/[_-]/g, ' '); return tokens.every(token => name.includes(token)); });
}
// The preview uses current scope rules only; prior translations never suppress submissions.
export function previewTranslation(drawings: Drawing[], scope: Scope, targets: TargetLanguage[]) {
  const perTarget = [...new Set(targets)].map(target => ({
    target, count: assessScope(drawings, scope, target).filter(decision => decision.eligible).length,
  }));
  return { perTarget, total: perTarget.reduce((sum, item) => sum + item.count, 0) };
}
export function jobTargets(job: Job): TargetLanguage[] {
  return job.targets?.length ? job.targets : [job.target];
}
export function jobTargetLabel(job: Job): string {
  return jobTargets(job).map(target => LANGUAGES[target].name).join(', ');
}
export function uniqueName(proposed: string, drawings: Pick<Drawing, 'name'>[]): string {
  const stem = proposed.replace(/\.dwg$/i, '');
  let name = proposed, number = 2;
  while (drawings.some(d => d.name.toLowerCase() === name.toLowerCase())) name = stem + '_' + number++ + '.dwg';
  return name;
}
export function createCopy(drawing: Drawing, language: TargetLanguage, drawings: Drawing[]): Drawing {
  const suffix = LANGUAGES[language].suffix;
  const stem = drawing.baseName.replace(/\.dwg$/i, '');
  return { ...structuredClone(drawing), id: uid(), copiedFrom: drawing.id, language,
    name: uniqueName(stem + '_' + suffix + '.dwg', drawings), folder: 'Translations/' + suffix + '/' };
}
export function freshLocateDemo(drawings: Drawing[]): { drawings: Drawing[]; drawing: Drawing } {
  const template = locateDemo as Drawing;
  const existing = drawings.find(d => d.demo === 'locate' && !d.copiedFrom && d.language === 'en'
    && JSON.stringify(d.objects) === JSON.stringify(template.objects));
  if (existing) return { drawings, drawing: existing };
  const drawing: Drawing = { ...structuredClone(template), id: uid(), name: uniqueName(template.name, drawings) };
  return { drawings: [...drawings, drawing], drawing };
}
export function editObject(drawings: Drawing[], drawingId: string, objectId: string, value: string): Drawing[] {
  return drawings.map(d => d.id !== drawingId ? d : { ...d, objects: d.objects.map(o => o.id !== objectId || o.locked || o.text === value ? o : {
    ...o, text: value, language: d.language, lastStatus: undefined, lastReason: undefined,
  }) });
}
// These are the actual text limits; selection and Locate do not add visual padding.
export function textBounds(object: TextObject) {
  return { x: 0, y: -(object.fontSize ?? 11), width: object.width, height: object.height };
}
export function measureOverflow(object: TextObject, text: string): boolean {
  if (typeof document === 'undefined') return false;
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return false;
  const size = object.fontSize ?? 11;
  context.font = size + 'px Arial';
  return text.split('\n').some(line => context.measureText(line).width > object.width) || text.split('\n').length * size * 1.4 > object.height;
}
// Drawing, object and language identify a result; text and status define its navigation group.
export function reportInstanceKey(row: Pick<ReportRow, 'sourceDrawingId' | 'outputDrawingId' | 'objectId' | 'target'>): string {
  return JSON.stringify([row.sourceDrawingId, row.outputDrawingId, row.objectId, row.target]);
}
export function instances(rows: ReportRow[], original: string, status: RowStatus): ReportRow[] {
  return rows.filter(r => r.original === original && r.status === status);
}
export function jobSourceLabel(job: Job): string {
  const languages = [...new Set(job.files.flatMap(f => f.sourceLanguages))];
  return languages.length === 1 ? LANGUAGES[languages[0]].name : 'Multiple source languages';
}
export function retainedObjects(drawing: Drawing): number {
  return drawing.objects.filter(o => o.language !== drawing.language).length;
}

// Version 1 compatibility is isolated here; version 2 has one text value per object.
interface LegacyObject extends Omit<TextObject, 'text' | 'language'> {
  sourceText: string; translations?: Partial<Record<TargetLanguage, string>>;
}
interface LegacyDrawing extends Omit<Drawing, 'language' | 'baseName' | 'objects'> { objects: LegacyObject[] }
interface LegacyState { version: 1; drawings: LegacyDrawing[]; jobs: Job[] }
function migrateV1(legacy: LegacyState): PersistedState {
  const drawings: Drawing[] = [];
  const references = new Map<string, Map<Language, string>>();
  const usedNames = legacy.drawings.map(d => ({ name: d.name }));
  const baseNameFor = (drawing: LegacyDrawing): string => {
    let current = drawing;
    const seen = new Set<string>();
    while (current.copiedFrom && !seen.has(current.id)) {
      seen.add(current.id);
      const parent = legacy.drawings.find(d => d.id === current.copiedFrom);
      if (!parent) break;
      current = parent;
    }
    return current.name.replace(/_(?:FR|DE|ZH|EN)(?:_\d+)?\.dwg$/i, '.dwg');
  };
  for (const drawing of legacy.drawings) {
    const suffix = drawing.copiedFrom && drawing.name.match(/_(FR|DE|ZH)(?:_\d+)?\.dwg$/i)?.[1]?.toLowerCase();
    const primary: Language = isLanguage(suffix) ? suffix : 'en';
    const reportLanguages = legacy.jobs.filter(job => job.files.some(file => file.outputId === drawing.id) || job.rows.some(row => row.outputDrawingId === drawing.id)).map(job => job.target);
    const languages: Language[] = [...new Set<Language>([primary, 'en', ...drawing.objects.flatMap(o => Object.keys(o.translations ?? {}).filter(isLanguage)), ...reportLanguages])];
    const byLanguage = new Map<Language, string>();
    const baseName = baseNameFor(drawing);
    for (const language of languages) {
      const keepId = language === primary;
      const id = keepId ? drawing.id : uid();
      const name = keepId ? drawing.name : uniqueName(baseName.replace(/\.dwg$/i, '') + '_' + LANGUAGES[language].suffix + '.dwg', usedNames);
      if (!keepId) usedNames.push({ name });
      const objects: TextObject[] = drawing.objects.map(o => {
        const { sourceText, translations, ...geometry } = o;
        const translated = language === 'en' ? undefined : translations?.[language];
        return { ...geometry, text: translated ?? sourceText, language: translated === undefined ? 'en' : language };
      });
      const { objects: _objects, ...metadata } = drawing;
      drawings.push({ ...metadata, id, name, baseName, language, objects,
        copiedFrom: keepId ? drawing.copiedFrom : drawing.id,
        folder: keepId ? drawing.folder : 'Translations/' + LANGUAGES[language].suffix + '/' });
      byLanguage.set(language, id);
    }
    references.set(drawing.id, byLanguage);
  }
  const jobs = legacy.jobs.map(job => {
    const outputFor = (oldId: string) => references.get(oldId)?.get(job.target) ?? oldId;
    const sourceFor = (oldId: string) => references.get(oldId)?.get('en') ?? oldId;
    return { ...job,
      rows: job.rows.map(row => {
        const outputDrawingId = outputFor(row.outputDrawingId);
        return { ...row, sourceDrawingId: sourceFor(row.sourceDrawingId), outputDrawingId,
          sourceLanguage: row.sourceLanguage ?? 'en', drawingName: drawings.find(d => d.id === outputDrawingId)?.name ?? row.drawingName };
      }),
      files: job.files.map(file => {
        const outputId = outputFor(file.outputId);
        return { ...file, sourceId: sourceFor(file.sourceId), outputId,
          sourceLanguages: file.sourceLanguages ?? ['en' as const], name: drawings.find(d => d.id === outputId)?.name ?? file.name };
      }),
    };
  });
  return { version: 2, drawings, jobs };
}
// Accept the retired status when loading older workspaces; preserve snapshots and references.
function normalizeStoredStatuses(state: PersistedState): PersistedState {
  const retired = (status: unknown) => status === 'Unchanged';
  return { ...state,
    drawings: state.drawings.map(drawing => ({ ...drawing, objects: drawing.objects.map(object => {
      const lastStatus = retired(object.lastStatus) ? 'Skipped' as const : object.lastStatus;
      const lastReason = typeof object.lastReason === 'string' ? reportReason(lastStatus, object.lastReason) : object.lastReason;
      return { ...object, ...(lastStatus !== object.lastStatus ? { lastStatus } : {}), ...(lastReason !== object.lastReason ? { lastReason } : {}) };
    }) })),
    jobs: state.jobs.map(job => ({ ...job, rows: job.rows.map(row => {
      const status = retired(row.status) ? 'Skipped' as const : row.status;
      return { ...row, status, reason: reportReason(status, row.reason) };
    }) })),
  };
}
function recoverInterrupted(state: PersistedState): PersistedState {
  const jobs = state.jobs.map(job => {
    if (job.status !== 'Running') return job;
    const rows = job.rows.map(r => r.reason === 'Waiting for translation' ? { ...r, status: 'Failed' as const, reason: 'Interrupted by page reload; translation was not restarted' } : r);
    for (const row of rows.filter(r => r.reason.startsWith('Interrupted by page reload'))) {
      const object = state.drawings.find(d => d.id === row.outputDrawingId)?.objects.find(o => o.id === row.objectId);
      if (object) { object.lastStatus = 'Failed'; object.lastReason = row.reason; }
    }
    return { ...job, status: 'Interrupted' as const, completedAt: new Date().toISOString(), processed: job.total, rows,
      files: job.files.map(f => ['Running', 'Waiting'].includes(f.status) ? { ...f, status: 'Failed' as const, processed: f.total } : f) };
  });
  return { ...state, jobs };
}
export function restoreState(raw: string | null): PersistedState {
  if (!raw) return freshState();
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.drawings) || !parsed.drawings.length || !Array.isArray(parsed.jobs)) throw new Error('Invalid state');
    let state: PersistedState;
    if (parsed.version === 1) {
      if (parsed.drawings.some((d: LegacyDrawing) => !Array.isArray(d.objects) || d.objects.some(o => typeof o.sourceText !== 'string'))) throw new Error('Invalid legacy drawing');
      state = migrateV1(parsed);
    } else if (parsed.version === 2) {
      if (parsed.drawings.some((d: Drawing) => !d.id || !d.name || !d.baseName || !isLanguage(d.language) || !Array.isArray(d.objects)
        || d.objects.some(o => !o.id || typeof o.text !== 'string' || !isLanguage(o.language)))) throw new Error('Invalid drawing');
      // Reconstruct the current schema instead of carrying obsolete settings forward.
      state = { version: 2, drawings: parsed.drawings, jobs: parsed.jobs };
    } else throw new Error('Unknown storage version');
    if (!state.drawings.some(d => d.demo === 'locate')) state.drawings.push(structuredClone(locateDemo) as Drawing);
    return recoverInterrupted(normalizeStoredStatuses(state));
  } catch { return freshState(); }
}
