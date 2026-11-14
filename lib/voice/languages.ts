export type TargetLanguage = {
  code: string;
  label: string;
};

/** Languages a listener can request. ISO 639-1 codes, plus ISO 639-3 yue. */
export const TARGET_LANGUAGES: readonly TargetLanguage[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'zh', label: 'Mandarin Chinese' },
  { code: 'yue', label: 'Cantonese' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'ko', label: 'Korean' },
  { code: 'ja', label: 'Japanese' },
  { code: 'hi', label: 'Hindi' },
  { code: 'tl', label: 'Tagalog' },
  { code: 'fr', label: 'French' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ar', label: 'Arabic' },
] as const;

const TARGET_LANGUAGE_CODES = new Set(
  TARGET_LANGUAGES.map((language) => language.code)
);

/** ElevenLabs Scribe returns ISO 639-3 codes such as "eng" and "cmn". */
const ISO_639_3_TO_1: Record<string, string> = {
  eng: 'en',
  spa: 'es',
  zho: 'zh',
  cmn: 'zh',
  chi: 'zh',
  yue: 'yue',
  vie: 'vi',
  kor: 'ko',
  jpn: 'ja',
  hin: 'hi',
  tgl: 'tl',
  fil: 'tl',
  fra: 'fr',
  fre: 'fr',
  por: 'pt',
  ara: 'ar',
  deu: 'de',
  ger: 'de',
  ita: 'it',
  rus: 'ru',
};

const LANGUAGE_LABELS: Record<string, string> = {
  ...Object.fromEntries(
    TARGET_LANGUAGES.map((language) => [language.code, language.label])
  ),
  de: 'German',
  it: 'Italian',
  ru: 'Russian',
};

export function isTargetLanguage(code: string): boolean {
  return TARGET_LANGUAGE_CODES.has(code);
}

/**
 * Collapse region tags and ISO 639-3 codes to the short code used by the API.
 * Unknown codes are lowercased and returned unchanged.
 */
export function normalizeLanguageCode(code: string): string {
  const primary = code.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  if (!primary) return '';
  if (primary.length === 2 || primary === 'yue') return primary;
  return ISO_639_3_TO_1[primary] ?? primary;
}

export function languagesMatch(left: string, right: string): boolean {
  const normalizedLeft = normalizeLanguageCode(left);
  const normalizedRight = normalizeLanguageCode(right);
  return normalizedLeft !== '' && normalizedLeft === normalizedRight;
}

export function languageLabel(code: string): string {
  const normalized = normalizeLanguageCode(code);
  return LANGUAGE_LABELS[normalized] ?? normalized;
}
