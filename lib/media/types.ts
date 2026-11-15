import { z } from 'zod';

// Browser-safe contracts. Upload the file directly; never send storage keys.
export const MAX_IMAGE_BYTES = 5_000_000;
export const MAX_MEDIA_AUDIO_BYTES = 4 * 1024 * 1024;
export const mediaUploadSchema = z.object({
  contentType: z.string().min(1).max(100),
  byteSize: z.number().int().positive().safe()
}).strict();
export const mediaCompleteSchema = z.object({ uploadToken: z.string().min(1).max(4096) }).strict();
export type MediaUploadRequest = z.input<typeof mediaUploadSchema>;
export type MediaCompleteRequest = z.input<typeof mediaCompleteSchema>;
export interface MediaUploadResponse {
  upload: {
    url: string;
    method: 'POST';
    fields: Record<string, string>;
    expiresAt: string;
    uploadToken: string;
    contentType: string;
    byteSize: number;
  };
}
export interface MediaCompleteResponse {
  media: { url: string; contentType: string; byteSize: number };
  cleanupPending: boolean;
}
export interface MediaDeleteResponse { success: true }

export function normalizeMediaType(value: string): string {
  const type = value.split(';')[0].trim().toLowerCase();
  return ({
    'audio/x-wav': 'audio/wav', 'audio/wave': 'audio/wav',
    'audio/m4a': 'audio/mp4', 'audio/x-m4a': 'audio/mp4', 'video/mp4': 'audio/mp4',
    'audio/mp3': 'audio/mpeg'
  } as Record<string, string>)[type] ?? type;
}
