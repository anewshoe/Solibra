import { filenameForAudio } from '@/lib/voice/audio';
import type { VoiceProcessResult, VoiceTranscript, VoiceTranslationFailure } from '@/lib/voice/types';

function stringFields(value: unknown, keys: string[]): value is Record<string, string> {
  return value !== null && typeof value === 'object' && keys.every((key) => typeof (value as Record<string, unknown>)[key] === 'string');
}
export function isVoiceResult(value: unknown): value is VoiceProcessResult {
  return stringFields(value, ['transcript', 'originalLanguage', 'translation', 'targetLanguage']);
}
export function isTranslationFailure(value: unknown): value is VoiceTranslationFailure {
  return stringFields(value, ['transcript', 'originalLanguage', 'targetLanguage', 'error']) && value.stage === 'translation';
}

export class VoiceRequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly partial?: VoiceTranslationFailure) { super(message); this.name = 'VoiceRequestError'; }
}

export async function requestVoicePreview(input: { targetLanguage: string; signal: AbortSignal; transcript?: VoiceTranscript; audio?: Blob; mimeType?: string }): Promise<VoiceProcessResult> {
  let body: FormData | string;
  if (input.transcript) body = JSON.stringify({ ...input.transcript, targetLanguage: input.targetLanguage });
  else {
    if (!input.audio) throw new Error('Record a story first.');
    body = new FormData();
    body.append('audio', input.audio, filenameForAudio(input.mimeType || input.audio.type));
    body.append('targetLanguage', input.targetLanguage);
  }
  const response = await fetch(input.transcript ? '/api/voice/translate' : '/api/voice/process', {
    method: 'POST', credentials: 'same-origin', signal: input.signal,
    headers: input.transcript ? { 'Content-Type': 'application/json' } : undefined, body
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = stringFields(payload, ['error']) ? payload.error : `Processing failed (HTTP ${response.status}). Try again.`;
    throw new VoiceRequestError(response.status === 401 ? input.transcript ? 'Sign in to translate this transcript. The original remains available.' : 'Sign in to process your recording. Your draft stays here while this preview is open.' : error, response.status, isTranslationFailure(payload) ? payload : undefined);
  }
  if (!isVoiceResult(payload)) throw new Error('The server returned an incomplete result. Your original recording is still available.');
  return payload;
}
