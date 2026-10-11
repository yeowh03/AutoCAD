// Language identifiers come from the bundled IANA catalogue and are validated at runtime.
export type Language = string;
export type TargetLanguage = Language;
export { LANGUAGES } from './languages';
export const OBJECT_TYPES = ['MText', 'DBText', 'MultiLeader', 'BlockAttribute', 'Dimension', 'TableCell'] as const;
export type ObjectType = typeof OBJECT_TYPES[number] | 'Unsupported';
export type RowStatus = 'Translated' | 'Skipped' | 'Failed' | 'Warning';
export interface ReportView { status: RowStatus | 'All'; drawing: string; search: string; scrollTop: number; scrollLeft: number; pageScrollTop: number }
export interface TextObject {
  id: string; type: ObjectType; text: string; language: Language; layer: string;
  x: number; y: number; width: number; height: number; locked: boolean; fontSize?: number;
  lastStatus?: RowStatus; lastReason?: string;
}
export interface Drawing {
  id: string; name: string; baseName: string; language: Language;
  discipline: 'Architecture' | 'Mechanical' | 'Site'; description: string;
  folder: string; copiedFrom?: string; demo?: 'locate'; objects: TextObject[];
}
export interface Settings { targets: TargetLanguage[]; output: 'same' | 'copy'; provider: 'demo' | 'gemini' }
export interface Scope { drawingIds: string[]; selection?: string[] }
export interface ReportRow {
  id: string; sourceDrawingId: string; outputDrawingId: string; drawingName: string;
  objectId: string; type: ObjectType; layer: string; original: string; sourceLanguage: Language;
  translation: string; status: RowStatus; reason: string; target: TargetLanguage;
}
export type FileStatus = 'Waiting' | 'Running' | 'Complete' | 'Warning' | 'Failed';
export interface JobFile {
  sourceId: string; outputId: string; name: string; sourceLanguages: Language[]; target?: TargetLanguage;
  total: number; processed: number; status: FileStatus;
}
export interface Job {
  id: string; startedAt: string; completedAt?: string; target: TargetLanguage; targets?: TargetLanguage[];
  provider: Settings['provider']; status: 'Running' | 'Complete' | 'Interrupted';
  files: JobFile[]; rows: ReportRow[]; total: number; processed: number;
}
export interface PersistedState { version: 2; drawings: Drawing[]; jobs: Job[] }
export interface Decision { drawing: Drawing; object: TextObject; target: TargetLanguage; eligible: boolean; status?: RowStatus; reason: string }
export interface ProviderItem { id: string; text: string; sourceLanguage: Language; objectId?: string }
export interface ProviderResult { id: string; text?: string; error?: string }
export interface TranslationProvider {
  translate(items: ProviderItem[], target: TargetLanguage, signal?: AbortSignal): Promise<ProviderResult[]>;
}
