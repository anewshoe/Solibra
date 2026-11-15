import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { messages, teams, messageTranslations } from '@/lib/db/schema';
import { requireNookMembership } from '@/lib/nooks/service';
import { NookError } from '@/lib/nooks/errors';
import { storage, UPLOAD_SECONDS } from '@/lib/media/storage';
import { signTicket, readTicket } from './tickets';
import { matchesMediaSignature, parseMediaRange, validateMedia } from '@/lib/media/validation';
import { normalizeMediaType } from '@/lib/media/types';
import type { MediaUploadRequest, MediaUploadResponse, MediaCompleteResponse } from '@/lib/media/types';
export interface MessageMediaScope {nookId:number;messageId:number}
type Transaction=Parameters<Parameters<typeof db.transaction>[0]>[0];
function prefix(scope:MessageMediaScope){return `nooks/${scope.nookId}/messages/${scope.messageId}`;}
function validKey(scope:MessageMediaScope,key:string,folder:'objects'|'staging') {
 const start=prefix(scope)+'/'+folder+'/';
 return key.startsWith(start)&&/^[0-9a-f-]{36}\.(webm|m4a|ogg|wav|mp3|aac)$/.test(key.slice(start.length));
}
export function mediaUrl(scope:MessageMediaScope){return `/api/nooks/${scope.nookId}/messages/${scope.messageId}/media`;}
export async function authorizeMessageAudio(tx:Transaction,userId:number,scope:MessageMediaScope,manage:boolean) {
 const [nook]=await tx.select({id:teams.id}).from(teams).where(eq(teams.id,scope.nookId)).for('share');
 if(!nook)throw new NookError(404,'NOT_FOUND','Nook not found.');
 const role=await requireNookMembership(tx,userId,scope.nookId);
 const [row]=await tx.select().from(messages).where(and(eq(messages.id,scope.messageId),eq(messages.nookId,scope.nookId))).for(manage?'update':'share');
 if(!row)throw new NookError(404,'NOT_FOUND','Nook message not found.');
 if(manage&&role!=='owner'&&row.senderId!==userId)throw new NookError(403,'FORBIDDEN','Only the sender or a Nook owner may manage this recording.');
 if(row.type!=='audio')throw new NookError(415,'INVALID_REQUEST','This Nook message is not an audio message.');
 if(row.audioStorageKey&&!validKey(scope,row.audioStorageKey,'objects'))throw new NookError(409,'CONFLICT','The Nook message recording reference is invalid.');
 return row;
}
async function resource(tx:Transaction,userId:number,scope:MessageMediaScope,manage:boolean) {
 const row=await authorizeMessageAudio(tx,userId,scope,manage);return {kind:'audio' as const,key:row.audioStorageKey,version:row.updatedAt.toISOString()};
}
async function saveKey(tx:Transaction,scope:MessageMediaScope,key:string|null,previousVersion:string) {
 await tx.delete(messageTranslations).where(eq(messageTranslations.messageId,scope.messageId));
 await tx.update(messages).set({audioStorageKey:key,originalTranscript:null,sourceLanguage:null,processingStatus:key?'draft':null,updatedAt:new Date(Math.max(Date.now(),Date.parse(previousVersion)+1))}).where(and(eq(messages.id,scope.messageId),eq(messages.nookId,scope.nookId)));
}
export async function loadStoredMessageAudio(userId: number, scope: MessageMediaScope, expectedKey: string, signal: AbortSignal) {
  try {
    const row = await db.transaction(tx => authorizeMessageAudio(tx, userId, scope, true));
    if (!row.audioStorageKey || row.audioStorageKey !== expectedKey) {
      throw new NookError(409, 'CONFLICT', 'Nook audio changed. Retry processing the current recording.');
    }
    signal.throwIfAborted();
    const meta = await storage.head(row.audioStorageKey);
    const file = validateMedia('audio', meta.contentType, meta.byteSize);
    const reader = (await storage.get(row.audioStorageKey)).getReader();
    const cancel = () => { void reader.cancel().catch(() => {}); };
    signal.addEventListener('abort', cancel, { once: true });
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (!signal.aborted) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > file.byteSize) throw new NookError(413, 'INVALID_REQUEST', 'Stored Nook audio exceeds its expected size.');
        chunks.push(value);
      }
      signal.throwIfAborted();
      const data = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
      if (size !== file.byteSize || !matchesMediaSignature(data.subarray(0, 32), file.contentType)) {
        throw new NookError(415, 'INVALID_REQUEST', 'Stored Nook audio is incomplete or unsupported.');
      }
      return { data, contentType: file.contentType, filename: `memory.${file.extension}` };
    } finally {
      signal.removeEventListener('abort', cancel);
      await reader.cancel().catch(() => {}); reader.releaseLock();
    }
  } catch (error) { return serviceError(error); }
}
async function safeRemove(key: string) {
  try { await storage.remove(key); return true; }
  catch { return false; }
}
async function prefixBytes(stream: ReadableStream): Promise<Uint8Array> {
  const reader = stream.getReader();
  const bytes = new Uint8Array(32);
  let length = 0;
  try {
    while (length < bytes.length) {
      const { done, value } = await reader.read();
      if (done) break;
      const count = Math.min(value.byteLength, bytes.length - length);
      bytes.set(value.subarray(0, count), length);
      length += count;
    }
    return bytes.subarray(0, length);
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
function serviceError(error: unknown): never {
  if (error instanceof NookError) throw error;
  // Do not log raw database/provider errors or upload tickets.
  throw new NookError(503, 'INTERNAL_ERROR', 'Could not update private Nook media. Retry the request.');
}

export async function initiateMediaUpload(userId: number, scope: MessageMediaScope, data: MediaUploadRequest): Promise<MediaUploadResponse> {
  try {
    return await db.transaction(async (tx) => {
      const current = await resource(tx, userId, scope, true);
      const file = validateMedia(current.kind, data.contentType, data.byteSize);
      const stagingKey = `${prefix(scope)}/staging/${randomUUID()}.${file.extension}`;
      const uploadToken = await signTicket({
        ...scope, userId, stagingKey, previousKey: current.key, version: current.version,
        contentType: file.contentType, byteSize: file.byteSize
      });
      const signed = await storage.signUpload(stagingKey, file.contentType, file.byteSize);
      return { upload: {
        ...signed, method: 'POST', uploadToken, expiresAt: new Date(Date.now() + UPLOAD_SECONDS * 1000).toISOString(),
        contentType: file.contentType, byteSize: file.byteSize
      } };
    });
  } catch (error) { return serviceError(error); }
}

async function cleanupUnreferenced(scope: MessageMediaScope, key: string) {
  // A lost COMMIT acknowledgement is ambiguous. Never delete a candidate until
  // a fresh database read confirms it isn't referenced; retain it if uncertain.
  try {
    const rows=await db.select({key:messages.audioStorageKey}).from(messages).where(and(eq(messages.id,scope.messageId),eq(messages.nookId,scope.nookId)));
    if (rows[0]?.key !== key) await safeRemove(key);
  } catch { /* Retain the private candidate for manual reconciliation. */ }
}
export async function completeMediaUpload(userId: number, scope: MessageMediaScope, token: string): Promise<MediaCompleteResponse> {
  const ticket = await readTicket(token);
  if (ticket.userId !== userId || ticket.nookId !== scope.nookId || ticket.messageId !== scope.messageId || !validKey(scope, ticket.stagingKey, 'staging')) {
    throw new NookError(400, 'INVALID_REQUEST', 'Nook upload authorization does not match this resource.');
  }
  let candidate: string | undefined;
  let authorized = false;
  let oldKey: string | null = null;
  let output: MediaCompleteResponse['media'];
  try {
    output = await db.transaction(async (tx) => {
      const current = await resource(tx, userId, scope, true);
      if (current.key !== ticket.previousKey || current.version !== ticket.version) {
        throw new NookError(409, 'CONFLICT', 'Nook media changed. Start a new upload.');
      }
      authorized = true;
      const file = validateMedia(current.kind, ticket.contentType, ticket.byteSize);
      const staging = await storage.head(ticket.stagingKey);
      if (staging.byteSize !== ticket.byteSize || normalizeMediaType(staging.contentType) !== ticket.contentType) {
        throw new NookError(415, 'INVALID_REQUEST', 'Uploaded Nook media does not match its authorization.');
      }
      candidate = `${prefix(scope)}/objects/${randomUUID()}.${file.extension}`;
      await storage.copy(ticket.stagingKey, candidate);
      // The presigned POST can be replayed until expiry. Validate an immutable
      // server-only copy, so replay cannot alter the published media afterwards.
      const copied = await storage.head(candidate);
      validateMedia(current.kind, copied.contentType, copied.byteSize);
      if (copied.byteSize !== ticket.byteSize || normalizeMediaType(copied.contentType) !== ticket.contentType ||
          !matchesMediaSignature(await prefixBytes(await storage.get(candidate, 'bytes=0-31')), ticket.contentType)) {
        throw new NookError(415, 'INVALID_REQUEST', 'Uploaded Nook media contents do not match the file type.');
      }
      oldKey = current.key;
      await saveKey(tx, scope, candidate, current.version);
      return { url: mediaUrl(scope), contentType: file.contentType, byteSize: file.byteSize };
    });
  } catch (error) {
    if (candidate) await cleanupUnreferenced(scope, candidate);
    // Never erase another in-flight upload's staging object on a stale-ticket conflict.
    if (authorized && !(error instanceof NookError && error.status === 409)) await safeRemove(ticket.stagingKey);
    return serviceError(error);
  }
  let cleanupPending = !(await safeRemove(ticket.stagingKey));
  if (oldKey && !(await safeRemove(oldKey))) cleanupPending = true;
  return { media: output, cleanupPending };
}

export async function retrieveMedia(userId: number, scope: MessageMediaScope, rangeHeader: string | null): Promise<Response> {
  try {
    return await db.transaction(async (tx) => {
      const current = await resource(tx, userId, scope, false);
      if (!current.key) throw new NookError(404, 'NOT_FOUND', 'Nook media not found.');
      const meta = await storage.head(current.key);
      const file = validateMedia(current.kind, meta.contentType, meta.byteSize);
      const headers = new Headers({
        'Content-Type': file.contentType, 'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `inline; filename="memory.${file.extension}"`,
        'Cache-Control': 'private, no-store', 'Vary': 'Cookie', 'Accept-Ranges': 'bytes',
        'Cross-Origin-Resource-Policy': 'same-origin'
      });
      let range;
      try { range = parseMediaRange(rangeHeader, meta.byteSize); } catch {
        headers.set('Content-Range', `bytes */${meta.byteSize}`);
        return new Response(null, { status: 416, headers });
      }
      const length = range ? range.end - range.start + 1 : meta.byteSize;
      headers.set('Content-Length', String(length));
      if (range) headers.set('Content-Range', `bytes ${range.start}-${range.end}/${meta.byteSize}`);
      const body = await storage.get(current.key, range ? `bytes=${range.start}-${range.end}` : undefined);
      return new Response(body, { status: range ? 206 : 200, headers });
    });
  } catch (error) { return serviceError(error); }
}
export async function deleteMedia(userId: number, scope: MessageMediaScope) {
  try {
    await db.transaction(async (tx) => {
      const current = await resource(tx, userId, scope, true);
      if (!current.key) { await saveKey(tx, scope, null, current.version); return; }
      // Failure leaves the DB reference intact for retry. DeleteObject is idempotent.
      // If DB commit fails after removal, retry DELETE to clear the stale reference.
      await storage.remove(current.key);
      await saveKey(tx, scope, null, current.version);
    });
    return { success: true as const };
  } catch (error) { return serviceError(error); }
}
