import 'server-only';

import { ElevenLabsClient, ElevenLabsError, ElevenLabsTimeoutError } from '@elevenlabs/elevenlabs-js';

import { normalizeLanguageCode } from '@/lib/voice/languages';

const SCRIBE_MODEL_ID = 'scribe_v3';

export class TranscriptionError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = 'TranscriptionError';
    this.status = status;
  }
}

export type TranscriptResult = {
  transcript: string;
  originalLanguage: string;
};

export async function transcribeAudio(input: {
  data: Uint8Array;
  filename: string;
  contentType: string;
  signal?: AbortSignal;
}): Promise<TranscriptResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new TranscriptionError(
      'ELEVENLABS_API_KEY is not set. Add it to .env and restart the server.',
      500
    );
  }

  const client = new ElevenLabsClient({ apiKey });

  let result;
  try {
    result = await client.speechToText.convert({
      modelId: SCRIBE_MODEL_ID,
      file: {
        data: input.data,
        filename: input.filename,
        contentType: input.contentType,
      },
      tagAudioEvents: false,
      diarize: false,
    }, { timeoutInSeconds: 70, maxRetries: 0, abortSignal: input.signal });
  } catch (error) {
    if (input.signal?.aborted) throw error;
    if (error instanceof ElevenLabsTimeoutError) {
      throw new TranscriptionError('Transcription timed out. Try a shorter recording.', 504);
    }
    throw new TranscriptionError(messageForTranscriptionFailure(error));
  }

  if (!('text' in result) || typeof result.text !== 'string' ||
      !('languageCode' in result) || typeof result.languageCode !== 'string') {
    throw new TranscriptionError('ElevenLabs returned an unexpected transcription response. Try again.');
  }
  const transcript = result.text;
  if (!transcript.trim()) {
    throw new TranscriptionError(
      'No speech was detected. Record a little longer and speak closer to the microphone.',
      422
    );
  }

  return {
    transcript,
    originalLanguage: normalizeLanguageCode(result.languageCode),
  };
}

function messageForTranscriptionFailure(error: unknown): string {
  if (error instanceof ElevenLabsError) {
    console.error('ElevenLabs transcription failed', {
      statusCode: error.statusCode ?? null,
    });
    if (error.statusCode === 400 && isKeyIdentifierError(error.body)) {
      return 'ELEVENLABS_API_KEY contains an API key ID instead of the secret key. Replace it with the secret API key and restart the server.';
    }
    if (error.statusCode === 401 || error.statusCode === 403) {
      return 'ElevenLabs rejected the API key. Check ELEVENLABS_API_KEY.';
    }
    if (error.statusCode === 429) {
      return 'ElevenLabs is rate limiting requests. Wait a moment and try again.';
    }
    if (error.statusCode === 422) {
      return 'ElevenLabs could not read this recording. Try a slightly longer clip.';
    }
    if (error.statusCode === 400 || error.statusCode === 404) {
      return 'ElevenLabs rejected the transcription request. Confirm your account has access to Scribe v3.';
    }
  } else {
    console.error('ElevenLabs transcription failed');
  }

  return 'Transcription failed. Check the recording and try again.';
}

function isKeyIdentifierError(body: unknown): boolean {
  if (!body || typeof body !== 'object' || !('detail' in body)) return false;
  const detail = body.detail;
  return detail !== null && typeof detail === 'object' &&
    'status' in detail && detail.status === 'api_key_id_used_as_api_key';
}
