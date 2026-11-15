import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { contributions, translations } from '@/lib/db/schema';
import { authorizeAudioContribution, loadStoredContributionAudio } from '@/lib/media/service';
import type { MediaScope } from '@/lib/media/service';
import { NookError } from '@/lib/nooks/errors';
import { transcribeAudio, TranscriptionError } from '@/lib/ai/transcribe';
import { translateTranscript, TranslationError, MAX_TRANSCRIPT_CHARACTERS } from '@/lib/ai/translate';
import { normalizeLanguageCode } from './languages';
import { processContributionSchema, translateContributionSchema } from './persistence-types';
import type { PersistedVoiceResponse, PersistedVoicePartialFailure, SavedTranslation } from './persistence-types';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Row = typeof contributions.$inferSelect;
type TranslationRow = typeof translations.$inferSelect;
type Lease = { audioKey: string; version: number };
// Longer than the request's 140s deadline, so an old request cannot normally
// reclaim its own lease while a provider call is still running.
export const PROCESSING_LEASE_MS = 180_000;
const contributionJson = (row: Row) => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });
const translationJson = (row: TranslationRow): SavedTranslation => ({ ...row, createdAt: row.createdAt.toISOString() });
const nextVersion = (row: Row) => new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
const hasTranscript = (row: Row) => Boolean(row.originalTranscript?.trim());

export function persistedSourceLanguage(value: string): string {
  const code = normalizeLanguageCode(value);
  if (!/^[a-z]{2,3}$/.test(code) || ['und','unk','xxx','xx','zxx','mul'].includes(code)) return 'und';
  try {
    return new Intl.DisplayNames(['en'], { type: 'language', fallback: 'code' }).of(code) === code ? 'und' : code;
  } catch { return 'und'; }
}
async function privateOperation<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof NookError) throw error;
    // Drizzle exceptions can include private SQL parameters. Never propagate them
    // to the existing wrapper's unknown-error logger.
    throw new NookError(503, 'INTERNAL_ERROR', 'Unable to save Nook voice results. Retry later.');
  }
}
function providerFailure(error: unknown, signal: AbortSignal, stage: 'transcription' | 'translation') {
  if (signal.aborted) return new NookError(504, 'INTERNAL_ERROR', `Nook ${stage} timed out or was cancelled. Retry later.`);
  if (error instanceof NookError) return error;
  const status = error instanceof TranscriptionError || error instanceof TranslationError ? error.status : 502;
  return new NookError(status, 'INTERNAL_ERROR', `Nook ${stage} failed. Check provider availability or free quota, then retry.`);
}
function checkLease(row: Row, lease: Lease) {
  if (row.audioStorageKey !== lease.audioKey || row.updatedAt.getTime() !== lease.version || row.processingStatus !== 'processing') {
    throw new NookError(409, 'CONFLICT', 'Nook audio or processing state changed. Stale results were discarded.');
  }
}
async function recover(userId: number, scope: MediaScope, lease: Lease) {
  try {
    await db.transaction(async tx => {
      const row = await authorizeAudioContribution(tx, userId, scope, true);
      checkLease(row, lease);
      await tx.update(contributions).set({
        processingStatus: hasTranscript(row) ? 'completed' : 'failed', updatedAt: nextVersion(row)
      }).where(eq(contributions.id, row.id));
    });
  } catch { /* Revoked permission, replaced audio, or database failure: do not overwrite newer state. Lease expiry allows later recovery. */ }
}

async function currentLease(tx: Transaction, userId: number, scope: MediaScope, lease: Lease) {
  const row = await authorizeAudioContribution(tx, userId, scope, true);
  checkLease(row, lease);
  return row;
}

export async function runPersistedVoice(
  userId: number, scope: MediaScope, request: unknown,
  mode: 'process' | 'translation', signal: AbortSignal
): Promise<PersistedVoiceResponse | PersistedVoicePartialFailure> {
  return privateOperation(async () => {
    const parsed = (mode === 'process' ? processContributionSchema : translateContributionSchema).safeParse(request);
    if (!parsed.success) throw new NookError(400, 'INVALID_REQUEST', 'Invalid Nook voice processing request.');
    const targetLanguage = parsed.data.targetLanguage;
    const reprocess = 'reprocess' in parsed.data && parsed.data.reprocess === true;
    if (signal.aborted) throw new NookError(504, 'INTERNAL_ERROR', 'Nook processing timed out or was cancelled.');
    const claim = await db.transaction(async tx => {
      const row = await authorizeAudioContribution(tx, userId, scope, true);
      if (!row.audioStorageKey) throw new NookError(409, 'CONFLICT', 'Attach audio before processing this Nook contribution.');
      const needsTranscription = mode === 'process' && (reprocess || !hasTranscript(row));
      if (mode === 'translation' && !hasTranscript(row)) {
        throw new NookError(409, 'CONFLICT', 'Transcribe this Nook contribution before requesting a translation.');
      }
      if (!needsTranscription) {
        const [cached] = await tx.select().from(translations).where(and(
          eq(translations.contributionId, row.id),
          eq(translations.sourceLanguage, row.sourceLanguage ?? 'und'),
          eq(translations.targetLanguage, targetLanguage)
        )).limit(1);
        if (cached) return { row, cached, needsTranscription: false, lease: null };
      }
      if (row.processingStatus === 'processing' && Date.now() - row.updatedAt.getTime() < PROCESSING_LEASE_MS) {
        throw new NookError(409, 'CONFLICT', 'This Nook contribution is already processing. Retry after it finishes.');
      }
      const version = nextVersion(row);
      const [claimed] = await tx.update(contributions).set({ processingStatus: 'processing', updatedAt: version })
        .where(eq(contributions.id, row.id)).returning();
      return { row: claimed, cached: null, needsTranscription, lease: { audioKey: row.audioStorageKey, version: version.getTime() } };
    });
    if (claim.cached) return { contribution: contributionJson(claim.row), translation: translationJson(claim.cached), cached: true };
    let row = claim.row;
    const lease = claim.lease!;
    if (claim.needsTranscription) {
      try {
        const audio = await loadStoredContributionAudio(userId, scope, lease.audioKey, signal);
        signal.throwIfAborted();
        const result = await transcribeAudio({ ...audio, signal });
        signal.throwIfAborted();
        if (!result.transcript.trim() || result.transcript.length > MAX_TRANSCRIPT_CHARACTERS) {
          throw new NookError(422, 'INVALID_REQUEST', 'The Nook transcript is empty or exceeds the supported length.');
        }
        const sourceLanguage = persistedSourceLanguage(result.originalLanguage);
        row = await db.transaction(async tx => {
          const current = await currentLease(tx, userId, scope, lease);
          await tx.delete(translations).where(eq(translations.contributionId, current.id));
          const version = nextVersion(current);
          const [saved] = await tx.update(contributions).set({
            originalTranscript: result.transcript, sourceLanguage, updatedAt: version
          }).where(eq(contributions.id, current.id)).returning();
          return saved;
        });
        lease.version = row.updatedAt.getTime();
      } catch (error) {
        await recover(userId, scope, lease);
        throw providerFailure(error, signal, 'transcription');
      }
    }
    try {
      signal.throwIfAborted();
      const translatedText = await translateTranscript({
        transcript: row.originalTranscript!, originalLanguage: row.sourceLanguage === 'und' ? '' : row.sourceLanguage ?? '',
        targetLanguage, signal
      });
      signal.throwIfAborted();
      if (!translatedText.trim()) throw new NookError(502, 'INTERNAL_ERROR', 'The Nook translation was empty.');
      return await db.transaction(async tx => {
        const current = await currentLease(tx, userId, scope, lease);
        const [translation] = await tx.insert(translations).values({
          contributionId: current.id, sourceLanguage: current.sourceLanguage ?? 'und', targetLanguage, translatedText
        }).onConflictDoUpdate({
          target: [translations.contributionId, translations.sourceLanguage, translations.targetLanguage],
          set: { translatedText }
        }).returning();
        const [finished] = await tx.update(contributions).set({ processingStatus: 'completed', updatedAt: nextVersion(current) })
          .where(eq(contributions.id, current.id)).returning();
        return { contribution: contributionJson(finished), translation: translationJson(translation), cached: false };
      });
    } catch (error) {
      await recover(userId, scope, lease);
      const failure = providerFailure(error, signal, 'translation');
      // Recheck authorization and the audio key before returning private partial
      // results. Never return the captured old transcript after removal/replacement.
      const current = await db.transaction(tx => authorizeAudioContribution(tx, userId, scope, false));
      if (current.audioStorageKey !== lease.audioKey || current.originalTranscript !== row.originalTranscript || current.sourceLanguage !== row.sourceLanguage) {
        throw new NookError(409, 'CONFLICT', 'Nook audio changed. Stale results were discarded.');
      }
      if (failure.status === 409 || failure.status === 401 || failure.status === 403 || failure.status === 404) throw failure;
      return {
        error: { code: failure.code, message: failure.message }, stage: 'translation', status: failure.status,
        contribution: contributionJson(current)
      };
    }
  });
}

export async function listSavedTranslations(userId: number, scope: MediaScope) {
  return privateOperation(() => db.transaction(async tx => {
    const row = await authorizeAudioContribution(tx, userId, scope, false);
    if (!row.audioStorageKey || !hasTranscript(row)) return { translations: [] };
    const rows = await tx.select().from(translations).where(and(
      eq(translations.contributionId, row.id), eq(translations.sourceLanguage, row.sourceLanguage ?? 'und')
    )).orderBy(asc(translations.createdAt), asc(translations.id));
    return { translations: rows.map(translationJson) };
  }));
}
