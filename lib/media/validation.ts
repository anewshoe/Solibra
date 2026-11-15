import { NookError } from '@/lib/nooks/errors';
import { MAX_IMAGE_BYTES, MAX_MEDIA_AUDIO_BYTES, normalizeMediaType } from './types';

const imageTypes: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const audioTypes: Record<string, string> = {
  'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg',
  'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/aac': 'aac'
};
export function validateMedia(kind: 'photo' | 'audio', type: string, byteSize: number) {
  const contentType = normalizeMediaType(type);
  const extension = (kind === 'photo' ? imageTypes : audioTypes)[contentType];
  if (!extension) throw new NookError(415, 'INVALID_REQUEST', 'Unsupported Nook media type. Use JPEG, PNG, WebP, or a supported audio recording.');
  const max = kind === 'photo' ? MAX_IMAGE_BYTES : MAX_MEDIA_AUDIO_BYTES;
  if (!Number.isSafeInteger(byteSize) || byteSize < 16 || byteSize > max) {
    throw new NookError(413, 'INVALID_REQUEST', `Nook media must be between 16 and ${max} bytes.`);
  }
  return { contentType, extension, byteSize };
}
export function matchesMediaSignature(bytes: Uint8Array, type: string) {
  const ascii = (offset: number, value: string) => [...value].every((c, i) => bytes[offset + i] === c.charCodeAt(0));
  if (bytes.length < 12) return false;
  switch (normalizeMediaType(type)) {
    case 'image/jpeg': return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case 'image/png': return [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b);
    case 'image/webp': return ascii(0, 'RIFF') && ascii(8, 'WEBP');
    case 'audio/wav': return ascii(0, 'RIFF') && ascii(8, 'WAVE');
    case 'audio/ogg': return ascii(0, 'OggS');
    case 'audio/mp4': return ascii(4, 'ftyp');
    case 'audio/mpeg': return ascii(0, 'ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    case 'audio/aac': return bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0;
    case 'audio/webm': return [0x1a,0x45,0xdf,0xa3].every((b,i) => bytes[i] === b);
    default: return false;
  }
}

export function parseMediaRange(value: string | null, size: number): { start: number; end: number } | undefined {
  if (value === null) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  const invalid = () => { throw new NookError(416, 'INVALID_REQUEST', 'Nook media range is not satisfiable.'); };
  if (!match || (!match[1] && !match[2])) return invalid();
  if (!match[1]) {
    const count = Number(match[2]);
    if (!Number.isSafeInteger(count) || count <= 0) return invalid();
    return { start: Math.max(0, size - count), end: size - 1 };
  }
  const start = Number(match[1]);
  const end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start >= size || end < start) return invalid();
  return { start, end };
}
