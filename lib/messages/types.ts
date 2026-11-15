import type { Message } from '@/lib/memories/types';
import type { NookErrorResponse } from '@/lib/nooks/types';
export { processContributionSchema as processMessageSchema, translateContributionSchema as translateMessageSchema } from '@/lib/voice/persistence-types';
export interface MessageTranslation {id:number;messageId:number;sourceLanguage:string;targetLanguage:string;translatedText:string;createdAt:string}
export interface MessageTranslationList {translations:MessageTranslation[]}
export interface MessageVoiceResult {message:Message;translation:MessageTranslation;cached:boolean}
export interface MessageVoicePartialFailure extends NookErrorResponse {message:Message;stage:'translation';status:number}
