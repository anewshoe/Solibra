import { MAX_TRANSCRIPT_CHARACTERS, TranslationError, translateTranscript } from '@/lib/ai/translate';
import { authorizeVoiceRequest } from '@/lib/voice/access';
import { baseContentType } from '@/lib/voice/audio';
import { isTargetLanguage, normalizeLanguageCode, SUPPORTED_LANGUAGE_MESSAGE } from '@/lib/voice/languages';
import { readVoiceBody, VoiceBodyError } from '@/lib/voice/request';
import type { VoiceProcessResult } from '@/lib/voice/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_JSON_BYTES = 128 * 1024;
const headers = { 'Cache-Control': 'no-store' };

/** Translation-only retry. Uses exactly the same auth and origin guard as uploads. */
export async function POST(request: Request) {
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]);
  const access = await authorizeVoiceRequest(request);
  if (!access.ok) return Response.json({ error: access.message }, { status: access.status, headers });

  try {
    if (baseContentType(request.headers.get('content-type') ?? '') !== 'application/json') {
      return jsonError('Send the transcript as JSON.', 400);
    }
    const data: unknown = JSON.parse((await readVoiceBody(request, MAX_JSON_BYTES,
      AbortSignal.any([signal, AbortSignal.timeout(10_000)]))).toString('utf8'));
    if (!data || typeof data !== 'object' || !('transcript' in data) ||
        typeof data.transcript !== 'string' || !data.transcript.trim() ||
        data.transcript.length > MAX_TRANSCRIPT_CHARACTERS) {
      return jsonError(`Use a transcript between 1 and ${MAX_TRANSCRIPT_CHARACTERS} characters.`, 400);
    }
    if (!('targetLanguage' in data) || typeof data.targetLanguage !== 'string' || !isTargetLanguage(data.targetLanguage)) {
      return jsonError(SUPPORTED_LANGUAGE_MESSAGE, 400);
    }
    if (!('originalLanguage' in data) || typeof data.originalLanguage !== 'string' ||
        (data.originalLanguage !== '' && !/^[a-z]{2,3}(?:[-_][a-z0-9]{2,8})?$/i.test(data.originalLanguage))) {
      return jsonError('Use the detected originalLanguage code from the transcript.', 400);
    }
    const originalLanguage = normalizeLanguageCode(data.originalLanguage);
    const translation = await translateTranscript({
      transcript: data.transcript, originalLanguage, targetLanguage: data.targetLanguage, signal,
    });
    const result: VoiceProcessResult = {
      transcript: data.transcript, originalLanguage, translation, targetLanguage: data.targetLanguage,
    };
    return Response.json(result, { headers });
  } catch (error) {
    if (error instanceof VoiceBodyError) return jsonError(error.message, error.status);
    if (error instanceof SyntaxError) return jsonError('Send valid JSON.', 400);
    if (signal.aborted) return jsonError('Translation timed out or was cancelled. Try again.', 504);
    if (error instanceof TranslationError) return jsonError(error.message, error.status);
    console.error('Voice translation retry failed');
    return jsonError('Translation failed. Try again.', 500);
  }
}

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers });
}
