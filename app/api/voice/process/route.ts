import { TranscriptionError, transcribeAudio } from '@/lib/ai/transcribe';
import { TranslationError, translateTranscript } from '@/lib/ai/translate';
import { authorizeVoiceRequest } from '@/lib/voice/access';
import { ACCEPTED_AUDIO_TYPES, baseContentType, filenameForAudio, MAX_AUDIO_BYTES } from '@/lib/voice/audio';
import { isTargetLanguage } from '@/lib/voice/languages';
import type { VoiceProcessError, VoiceProcessResult } from '@/lib/voice/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_MULTIPART_BYTES = MAX_AUDIO_BYTES + 64 * 1024;
const MIN_AUDIO_BYTES = 1000;

export async function POST(request: Request) {
  // Multipart forms can be posted cross-origin without a CORS preflight.
  const origin = request.headers.get('origin');
  try {
    if (request.headers.get('sec-fetch-site') === 'cross-site' ||
        (origin && new URL(origin).host !== (request.headers.get('host') ?? new URL(request.url).host))) {
      return jsonError('Submit the recording from this site.', 403);
    }
  } catch {
    return jsonError('Invalid request origin.', 403);
  }

  const access = await authorizeVoiceRequest(request);
  if (!access.ok) {
    return jsonError(access.message, access.status);
  }

  let formData: FormData;
  try {
    if (baseContentType(request.headers.get('content-type') ?? '') !== 'multipart/form-data') {
      return jsonError('Send the recording as multipart form data.', 400);
    }
    // Bound the body before parsing it, including chunked requests without a
    // Content-Length. Checking File.size alone allows unbounded memory usage.
    if (Number(request.headers.get('content-length')) > MAX_MULTIPART_BYTES) {
      return jsonError('The recording is larger than 15 MB.', 413);
    }
    const reader = request.body?.getReader();
    if (!reader) return jsonError('Attach a recording.', 400);
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > MAX_MULTIPART_BYTES) {
          await reader.cancel();
          return jsonError('The recording is larger than 15 MB.', 413);
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    formData = await new Response(Buffer.concat(chunks), {
      headers: { 'content-type': request.headers.get('content-type')! },
    }).formData();
  } catch {
    return jsonError('Send the recording as multipart form data.', 400);
  }

  if (formData.getAll('audio').length !== 1 || formData.getAll('targetLanguage').length !== 1) {
    return jsonError('Include exactly one audio file and one targetLanguage.', 400);
  }

  const targetLanguage = formData.get('targetLanguage');
  if (typeof targetLanguage !== 'string' || !isTargetLanguage(targetLanguage)) {
    return jsonError(
      'Choose a supported targetLanguage: en, es, zh, yue, vi, ko, ja, hi, tl, fr, pt, or ar.',
      400
    );
  }

  const audio = formData.get('audio');
  if (!(audio instanceof File)) {
    return jsonError('Attach an audio file in the audio field.', 400);
  }

  const contentType = baseContentType(audio.type);
  if (!ACCEPTED_AUDIO_TYPES.has(contentType)) {
    return jsonError(
      'Use a webm, mp4, mpeg, wav, ogg, or aac recording.',
      415
    );
  }

  if (audio.size < MIN_AUDIO_BYTES) {
    return jsonError('The recording is empty or too small. Record at least a second of speech.', 400);
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return jsonError('The recording is larger than 15 MB.', 413);
  }

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(110_000)]);
  try {
    const data = new Uint8Array(await audio.arrayBuffer());
    if (!matchesContainer(data, contentType)) {
      return jsonError('The file contents do not match a supported recording format.', 415);
    }
    const filename = filenameForAudio(contentType);
    const transcript = await transcribeAudio({ data, filename, contentType, signal });
    const translation = await translateTranscript({
      transcript: transcript.transcript,
      originalLanguage: transcript.originalLanguage,
      targetLanguage,
      signal,
    });

    const body: VoiceProcessResult = {
      transcript: transcript.transcript,
      originalLanguage: transcript.originalLanguage,
      translation,
      targetLanguage,
    };
    return Response.json(body, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (signal.aborted) {
      return jsonError('Processing timed out or was cancelled. Try a shorter recording.', 504);
    }
    if (error instanceof TranscriptionError || error instanceof TranslationError) {
      return jsonError(error.message, error.status);
    }
    console.error('Voice processing failed');
    return jsonError('Could not process the recording. Try again.', 500);
  }
}

function jsonError(message: string, status: number) {
  const body: VoiceProcessError = { error: message };
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

// Basic container validation. The provider still validates/decodes the audio;
// MIME headers and file extensions alone are untrusted client input.
function matchesContainer(data: Uint8Array, contentType: string): boolean {
  const ascii = (offset: number, text: string) =>
    [...text].every((char, index) => data[offset + index] === char.charCodeAt(0));
  switch (contentType) {
    case 'audio/mp4':
    case 'audio/m4a':
    case 'audio/x-m4a':
    case 'video/mp4':
      return ascii(4, 'ftyp');
    case 'audio/mpeg':
    case 'audio/mp3':
      return ascii(0, 'ID3') || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0);
    case 'audio/wav':
    case 'audio/wave':
    case 'audio/x-wav':
      return ascii(0, 'RIFF') && ascii(8, 'WAVE');
    case 'audio/ogg':
      return ascii(0, 'OggS');
    case 'audio/aac':
      return data[0] === 0xff && (data[1] & 0xf6) === 0xf0;
    default:
      return data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3;
  }
}
