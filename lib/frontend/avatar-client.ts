import { avatarUploadSchema } from '@/lib/avatars/types';
import type { AvatarUploadResponse, AvatarResult } from '@/lib/avatars/types';
async function result<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error?.message || 'Profile photo request failed. Refresh before retrying.');
  return body as T;
}
export async function uploadAvatar(file: File): Promise<AvatarResult> {
  const data = avatarUploadSchema.safeParse({ contentType: file.type, byteSize: file.size });
  if (!data.success) throw new Error('Choose a JPEG, PNG or WebP image between 16 and 2,000,000 bytes.');
  const { upload } = await result<AvatarUploadResponse>(await fetch('/api/profile/avatar', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data.data)
  }));
  const form = new FormData();
  for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
  form.append('file', file, 'profile-photo');
  if (!(await fetch(upload.url, { method: 'POST', credentials: 'omit', body: form })).ok) throw new Error('Storage rejected the profile photo. Try again.');
  return result<AvatarResult>(await fetch('/api/profile/avatar/complete', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadToken: upload.uploadToken })
  }));
}
export async function removeAvatar(): Promise<AvatarResult> {
  return result<AvatarResult>(await fetch('/api/profile/avatar', { method: 'DELETE', credentials: 'same-origin' }));
}
