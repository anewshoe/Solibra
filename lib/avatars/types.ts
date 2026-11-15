import { z } from 'zod';
import type { MediaUploadResponse } from '@/lib/media/types';

export const MAX_AVATAR_BYTES = 2_000_000;
export const avatarUploadSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
  byteSize: z.number().int().min(16).max(MAX_AVATAR_BYTES)
}).strict();
export const avatarCompleteSchema = z.object({ uploadToken: z.string().min(1).max(4096) }).strict();
export type AvatarUploadResponse = MediaUploadResponse;
export interface AvatarResult { avatarUrl: string | null; cleanupPending: boolean }
export function avatarUrl(user: { id: number; avatarStorageKey?: string | null; updatedAt?: Date | string }): string | null {
  if (!user.avatarStorageKey) return null;
  const version = user.updatedAt instanceof Date ? user.updatedAt.toISOString() : user.updatedAt ?? '';
  return `/api/users/${user.id}/avatar?v=${encodeURIComponent(version)}`;
}
