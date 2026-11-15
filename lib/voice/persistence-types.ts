import { z } from 'zod';
import { isTargetLanguage, normalizeLanguageCode, SUPPORTED_LANGUAGE_MESSAGE } from './languages';
import type { Contribution } from '@/lib/memories/types';
import type { NookErrorResponse } from '@/lib/nooks/types';

const targetLanguage = z.string().max(35).transform(normalizeLanguageCode)
  .refine(isTargetLanguage, SUPPORTED_LANGUAGE_MESSAGE);
export const processContributionSchema = z.object({
  targetLanguage,
  reprocess: z.boolean().default(false)
}).strict();
export const translateContributionSchema = z.object({ targetLanguage }).strict();
export type ProcessContributionRequest = z.input<typeof processContributionSchema>;
export type TranslateContributionRequest = z.input<typeof translateContributionSchema>;
export interface SavedTranslation {
  id: number; contributionId: number; sourceLanguage: string; targetLanguage: string;
  translatedText: string; createdAt: string;
}
export interface PersistedVoiceResponse {
  contribution: Contribution;
  translation: SavedTranslation;
  cached: boolean;
}
export interface PersistedVoicePartialFailure extends NookErrorResponse {
  stage: 'translation';
  status: number;
  contribution: Contribution;
}
export interface SavedTranslationListResponse { translations: SavedTranslation[] }
