import catalogue from './data/languages.json';

export interface LanguageInfo { name: string; suffix: string; nativeName?: string; aliases?: string[] }
type CatalogueRow = [code: string, name: string, nativeName?: string, aliases?: string[]];
const rows = catalogue.languages as CatalogueRow[];
export const LANGUAGES: Record<string, LanguageInfo> = Object.fromEntries(rows.map(([code, name, nativeName, aliases]) => [
  code, { name, suffix: code.toUpperCase(), nativeName, aliases },
]));
export const LANGUAGE_OPTIONS = Object.entries(LANGUAGES).map(([code, info]) => ({ code, ...info }));
export const OFFLINE_LANGUAGES = ['en', 'fr', 'de', 'zh'] as const;
export const hasOfflineFixtures = (language: string) => OFFLINE_LANGUAGES.some(code => code === language);
export const normalizeSearch = (text: string) => text.normalize('NFKD').replace(/\p{M}/gu, '').toLocaleLowerCase('en').trim();
const common = ['en', 'fr', 'de', 'zh', 'es', 'ar', 'hi', 'ja', 'pt', 'ru', 'ko', 'it', 'id', 'ms', 'ta', 'th', 'vi', 'zh-Hant'];
const searchable = LANGUAGE_OPTIONS.map(language => ({
  language, text: normalizeSearch([language.code, language.name, language.nativeName, ...(language.aliases ?? [])].filter(Boolean).join(' ')),
}));
export function searchLanguages(query: string) {
  const normalized = normalizeSearch(query);
  if (!normalized) return [...common.map(code => LANGUAGE_OPTIONS.find(language => language.code === code)!), ...LANGUAGE_OPTIONS.filter(language => !common.includes(language.code))];
  const tokens = normalized.split(/\s+/);
  const rank = (language: typeof LANGUAGE_OPTIONS[number]) => language.code.toLowerCase() === normalized ? 0 : normalizeSearch(language.name).startsWith(normalized) ? 1 : 2;
  return searchable.filter(item => tokens.every(token => item.text.includes(token))).map(item => item.language)
    .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'en'));
}
