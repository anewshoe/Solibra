/** Shared browser/server limits; no provider code or secrets in this module. */
// 4 MiB plus 64 KiB multipart overhead stays below Vercel's 4.5 MB limit.
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const AUDIO_SIZE_LABEL = '4 MiB';
export const MAX_RECORDING_DURATION_MS = 120 * 1000;

export const ACCEPTED_AUDIO_TYPES = new Set([
  'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/mp3', 'audio/wav',
  'audio/wave', 'audio/x-wav', 'audio/ogg', 'audio/aac', 'audio/m4a',
  'audio/x-m4a', 'video/webm', 'video/mp4',
]);

export function baseContentType(type: string): string {
  return type.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function filenameForAudio(type: string): string {
  const base = baseContentType(type);
  if (['audio/mp4', 'audio/m4a', 'audio/x-m4a', 'video/mp4'].includes(base)) return 'memory.m4a';
  if (['audio/mpeg', 'audio/mp3'].includes(base)) return 'memory.mp3';
  if (['audio/wav', 'audio/wave', 'audio/x-wav'].includes(base)) return 'memory.wav';
  if (base === 'audio/ogg') return 'memory.ogg';
  if (base === 'audio/aac') return 'memory.aac';
  return 'memory.webm';
}
