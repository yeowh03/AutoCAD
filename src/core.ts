import type { Decision, Drawing, GlossaryEntry, TextSegment, PersistedState, Preset, ReportRow, Scope, Settings, TargetLanguage, TextObject } from './types';
import { LANGUAGES, OBJECT_TYPES } from './types';
import level1 from './data/Level_01.json';
import level2 from './data/Level_02.json';
import mechanical from './data/Mechanical_Plan.json';
import site from './data/Site_Plan.json';

export const STORAGE_KEY = 'cad-translate-studio-v1';
export const uid = () => crypto.randomUUID();
export function freshState(): PersistedState {
  return {
    version: 1, drawings: structuredClone([level1, level2, mechanical, site]) as Drawing[], jobs: [],
    glossary: ['HVAC', 'AHU', 'AHU-01', 'DN100', 'Cor-Ten'].map(source => ({ id: uid(), kind: 'protected', source })),
    presets: [
      { id: 'architectural', name: 'Architectural Notes', settings: { types: ['MText', 'DBText', 'MultiLeader'], layers: ['A-ANNO-NOTE'], skipNumeric: true, skipDimensions: true, skipCodes: true, patterns: [] } },
      { id: 'mechanical', name: 'Mechanical Notes', settings: { types: ['MText', 'DBText', 'MultiLeader', 'BlockAttribute'], layers: ['M-ANNO-NOTE', 'M-EQPM-TAGS', 'E-ANNO-NOTE'], skipNumeric: true, skipDimensions: true, skipCodes: true, patterns: [] } },
    ],
  };
}
export function defaultSettings(drawings: Drawing[], provider: Settings['provider']): Settings {
  return { target: 'fr', types: ['MText', 'DBText', 'MultiLeader', 'BlockAttribute'], layers: [...new Set(drawings.flatMap(d => d.objects.map(o => o.layer)))], skipNumeric: true, skipDimensions: true, skipCodes: true, patterns: [], replaceExisting: false, output: 'same', provider };
}
export function validatePatterns(patterns: string[]): string | undefined {
  for (const pattern of patterns) {
    if (pattern.length > 120) return 'Keep patterns under 120 characters.';
    // Reject common nested/repeated quantifiers to avoid freezing the browser.
    if (/\([^)]*[+*][^)]*\)[+*{]|\([^)]*\|[^)]*\)[+*{]/.test(pattern)) return 'Nested or repeated groups are not supported.';
    try { new RegExp(pattern, 'i'); } catch { return `Invalid exclusion pattern: ${pattern}`; }
  }
}
export function preview(drawings: Drawing[], scope: Scope, settings: Settings, glossary: GlossaryEntry[]): Decision[] {
  const invalid = validatePatterns(settings.patterns);
  if (invalid) throw new Error(invalid);
  return drawings.filter(d => scope.drawingIds.includes(d.id)).flatMap(drawing => drawing.objects
    .filter(o => !scope.selection || scope.selection.includes(o.id))
    .map(object => {
      const base = { drawing, object, eligible: false };
      const skip = (reason: string, status: Decision['status'] = 'Skipped'): Decision => ({ ...base, reason, status });
      const text = object.sourceText.trim();
      if (!OBJECT_TYPES.includes(object.type as typeof OBJECT_TYPES[number])) return skip('Object type not supported');
      const segments = splitGlossaryText(object.sourceText, glossary, settings.target);
      const needsMT = segments.some(s => s.kind === 'translate');
      if (!needsMT && segments.some(s => s.kind === 'protected') && !segments.some(s => s.kind === 'preferred')) return skip('Listed in glossary (do not translate); not sent to MT API');
      if (!needsMT && !segments.some(s => s.kind === 'preferred')) return skip('No translatable content; not sent to MT API');
      if (!settings.types.includes(object.type)) return skip('Excluded by object type filter');
      if (!settings.layers.includes(object.layer)) return skip('Excluded by layer filter');
      if (settings.skipNumeric && /^[+-]?[\d\s.,]+$/.test(text)) return skip('Numeric-only text');
      if (settings.skipDimensions && /^(?:(?:FFL|EL|RL|CL)\s*[+-]?\d|\d+(?:\.\d+)?\s*(?:mm|cm|m|ft|in)\b)/i.test(text)) return skip('Dimension / level string');
      if (settings.skipCodes && /^(?:[A-Z]{1,5}[-.]?\d+(?:\.\d+)?|[A-Z]{1,5})$/.test(text)) return skip('Drawing reference / short code');
      if (settings.patterns.some(p => new RegExp(p, 'i').test(text))) return skip('Excluded by custom pattern');
      if (!settings.replaceExisting && object.translations[settings.target] !== undefined) return skip('Existing translation preserved; not sent to MT API', 'Unchanged');
      if (object.locked) return skip('Object is on a locked layer', 'Failed');
      return { drawing, object, eligible: true, reason: needsMT ? '' : 'Preferred translation from glossary; applied locally without MT API' };
    }));
}
export function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// Protected and preferred phrases stay local. Only surrounding language is sent to MT.
export function splitGlossaryText(text: string, glossary: GlossaryEntry[], language: TargetLanguage): TextSegment[] {
  const entries = glossary.filter(e => e.source.trim() && (e.kind === 'protected' || (e.language === language && e.target?.trim())))
    .sort((a, b) => b.source.length - a.source.length || (a.kind === 'protected' ? -1 : 1));
  const segments: TextSegment[] = [];
  const surrounding = (part: string) => {
    if (!part) return;
    if (!/[\p{L}\p{N}]/u.test(part)) { segments.push({ kind: 'literal', text: part }); return; }
    const leading = part.match(/^\s*/u)![0];
    const trailing = part.match(/\s*$/u)![0];
    if (leading) segments.push({ kind: 'literal', text: leading });
    segments.push({ kind: 'translate', text: part.slice(leading.length, part.length - trailing.length) });
    if (trailing) segments.push({ kind: 'literal', text: trailing });
  };
  if (!entries.length) { surrounding(text); return segments; }
  const regex = new RegExp(`(?<![\\p{L}\\p{N}])(?:${entries.map(e => escapeRegex(e.source)).join('|')})(?![\\p{L}\\p{N}])`, 'giu');
  let offset = 0;
  for (const match of text.matchAll(regex)) {
    surrounding(text.slice(offset, match.index));
    const original = match[0];
    const entry = entries.find(e => e.source.toLocaleLowerCase() === original.toLocaleLowerCase())!;
    segments.push(entry.kind === 'protected' ? { kind: 'protected', text: original } : { kind: 'preferred', text: original, replacement: entry.target! });
    offset = match.index + original.length;
  }
  surrounding(text.slice(offset));
  return segments;
}
export function assembleSegments(segments: TextSegment[], translated: Map<number, string>): string {
  return segments.map((segment, index) => {
    if (segment.kind === 'preferred') return segment.replacement;
    if (segment.kind !== 'translate') return segment.text;
    const result = translated.get(index);
    if (result === undefined || !result.trim()) throw new Error('MT API returned no text for a surrounding segment');
    return result;
  }).join('');
}
export function createCopy(drawing: Drawing, language: TargetLanguage, drawings: Drawing[]): Drawing {
  const suffix = LANGUAGES[language].suffix;
  const stem = drawing.name.replace(/\.dwg$/i, '');
  let name = `${stem}_${suffix}.dwg`, number = 2;
  while (drawings.some(d => d.name === name)) name = `${stem}_${suffix}_${number++}.dwg`;
  return { ...structuredClone(drawing), id: uid(), copiedFrom: drawing.id, name, folder: `Translations/${suffix}/` };
}
export function editObject(drawings: Drawing[], drawingId: string, objectId: string, language: 'en' | TargetLanguage, value: string): Drawing[] {
  return drawings.map(d => d.id !== drawingId ? d : { ...d, objects: d.objects.map(o => o.id !== objectId || o.locked || (language === 'en' && value === o.sourceText) ? o : {
    ...o, ...(language === 'en' ? { sourceText: value, translations: {} } : { translations: { ...o.translations, [language]: value } }),
  }) });
}
export function measureOverflow(object: TextObject, text: string): boolean {
  if (typeof document === 'undefined') return false;
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return false;
  const size = object.fontSize ?? 11;
  context.font = `${size}px Arial`;
  return text.split('\n').some(line => context.measureText(line).width > object.width) || text.split('\n').length * size * 1.4 > object.height;
}
export function instances(rows: ReportRow[], original: string): ReportRow[] {
  return rows.filter(r => r.original.trim().toLocaleLowerCase() === original.trim().toLocaleLowerCase());
}
export function savePreset(name: string, settings: Settings): Preset {
  const { types, layers, skipNumeric, skipDimensions, skipCodes, patterns } = settings;
  return { id: uid(), name, settings: structuredClone({ types, layers, skipNumeric, skipDimensions, skipCodes, patterns }) };
}
export function restoreState(raw: string | null): PersistedState {
  if (!raw) return freshState();
  try {
    const state = JSON.parse(raw) as PersistedState;
    if (state.version !== 1 || !Array.isArray(state.drawings) || !Array.isArray(state.jobs) || !Array.isArray(state.glossary) || !Array.isArray(state.presets)) throw new Error('Invalid state');
    if (state.drawings.some(d => !d.id || !d.name || !Array.isArray(d.objects) || d.objects.some(o => !o.id || typeof o.sourceText !== 'string' || !o.translations))) throw new Error('Invalid drawing');
    state.jobs = state.jobs.map(j => j.status !== 'Running' ? j : {
      ...j, status: 'Interrupted', completedAt: new Date().toISOString(), processed: j.total,
      files: j.files.map(f => ['Running', 'Waiting'].includes(f.status) ? { ...f, status: 'Failed', processed: f.total } : f),
      rows: j.rows.map(r => r.reason === 'Waiting for translation' ? { ...r, status: 'Failed', reason: 'Interrupted by page reload; translation was not restarted' } : r),
    });
    return state;
  } catch { return freshState(); }
}
