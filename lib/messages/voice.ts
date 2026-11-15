import 'server-only';
import { messages, messageTranslations } from '@/lib/db/schema';
import { createVoicePersistence } from '@/lib/voice/persistence-core';
import { messageJson } from '@/lib/memories/service';
import { authorizeMessageAudio, loadStoredMessageAudio } from './media';
import type { MessageMediaScope } from './media';
const voice=createVoicePersistence({ recordTable:messages, translationTable:messageTranslations, authorize:authorizeMessageAudio, load:loadStoredMessageAudio });
export async function processMessage(userId:number,scope:MessageMediaScope,request:unknown,mode:'process'|'translation',signal:AbortSignal) {
  const {record,...result}=await voice.run(userId,scope,request,mode,signal);
  // The shared engine serializes dates. Restore them only for the existing safe message serializer.
  const row={...record,createdAt:new Date(record.createdAt),updatedAt:new Date(record.updatedAt)} as typeof messages.$inferSelect;
  return {...result,message:messageJson(row)};
}
export const listMessageTranslations=voice.list;
