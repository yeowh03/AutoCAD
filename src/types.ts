export type Language = 'en' | 'fr' | 'de' | 'zh';
export type TargetLanguage = Exclude<Language, 'en'>;
export const LANGUAGES: Record<Language, { name: string; suffix: string }> = {
  en: { name: 'English', suffix: 'EN' }, fr: { name: 'French', suffix: 'FR' },
  de: { name: 'German', suffix: 'DE' }, zh: { name: 'Chinese (Simplified)', suffix: 'ZH' },
};
export const OBJECT_TYPES = ['MText', 'DBText', 'MultiLeader', 'BlockAttribute', 'Dimension', 'TableCell'] as const;
export type ObjectType = typeof OBJECT_TYPES[number] | 'Unsupported';
export interface TextObject {
  id: string; type: ObjectType; sourceText: string; layer: string;
  x: number; y: number; width: number; height: number; locked: boolean;
  translations: Partial<Record<TargetLanguage, string>>;
  fontSize?: number;
}
export interface Drawing {
  id: string; name: string; discipline: 'Architecture' | 'Mechanical' | 'Site';
  description: string; folder: string; copiedFrom?: string; objects: TextObject[];
}
export interface GlossaryEntry { id: string; kind: 'protected' | 'preferred'; source: string; target?: string; language?: TargetLanguage }
export interface Settings {
  target: TargetLanguage; types: ObjectType[]; layers: string[];
  skipNumeric: boolean; skipDimensions: boolean; skipCodes: boolean;
  patterns: string[]; replaceExisting: boolean; output: 'same' | 'copy';
  provider: 'demo' | 'gemini';
}
export interface Preset { id: string; name: string; settings: Pick<Settings, 'types' | 'layers' | 'skipNumeric' | 'skipDimensions' | 'skipCodes' | 'patterns'> }
export interface Scope { drawingIds: string[]; selection?: string[] }
export type RowStatus = 'Translated' | 'Skipped' | 'Unchanged' | 'Failed' | 'Warning';
export interface ReportRow {
  id: string; sourceDrawingId: string; outputDrawingId: string; drawingName: string;
  objectId: string; type: ObjectType; layer: string; original: string;
  translation: string; status: RowStatus; reason: string; target: TargetLanguage;
}
export type FileStatus = 'Waiting' | 'Running' | 'Complete' | 'Warning' | 'Failed';
export interface JobFile { sourceId: string; outputId: string; name: string; total: number; processed: number; status: FileStatus }
export interface Job {
  id: string; startedAt: string; completedAt?: string; target: TargetLanguage;
  provider: Settings['provider']; status: 'Running' | 'Complete' | 'Interrupted';
  files: JobFile[]; rows: ReportRow[]; total: number; processed: number;
}
export interface PersistedState { version: 1; drawings: Drawing[]; glossary: GlossaryEntry[]; presets: Preset[]; jobs: Job[] }
export interface Decision { drawing: Drawing; object: TextObject; eligible: boolean; status?: RowStatus; reason: string }
export type TextSegment = { kind: 'translate' | 'protected' | 'literal'; text: string } | { kind: 'preferred'; text: string; replacement: string };
export interface ProviderItem { id: string; text: string }
export interface ProviderResult { id: string; text?: string; error?: string }
export interface TranslationProvider { translate(items: ProviderItem[], language: TargetLanguage, signal?: AbortSignal): Promise<ProviderResult[]> }
