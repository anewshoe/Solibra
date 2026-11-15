import 'server-only';
import { contributions, translations } from '@/lib/db/schema';
import { authorizeAudioContribution, loadStoredContributionAudio } from '@/lib/media/service';
import type { MediaScope } from '@/lib/media/service';
import type { PersistedVoiceResponse, PersistedVoicePartialFailure, SavedTranslation } from './persistence-types';
import { createVoicePersistence } from './persistence-core';
export { PROCESSING_LEASE_MS, persistedSourceLanguage } from './persistence-core';
const service=createVoicePersistence({recordTable:contributions,translationTable:translations,authorize:authorizeAudioContribution,load:loadStoredContributionAudio});
export async function runPersistedVoice(userId:number,scope:MediaScope,request:unknown,mode:'process'|'translation',signal:AbortSignal):Promise<PersistedVoiceResponse|PersistedVoicePartialFailure> {
 const {record,...result}=await service.run(userId,scope,request,mode,signal);
 return {...result,contribution:record} as PersistedVoiceResponse|PersistedVoicePartialFailure;
}
export async function listSavedTranslations(userId:number,scope:MediaScope):Promise<{translations:SavedTranslation[]}> {
 return await service.list(userId,scope) as {translations:SavedTranslation[]};
}
