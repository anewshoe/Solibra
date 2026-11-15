import type { MediaUploadResponse, MediaCompleteResponse } from '@/lib/media/types';

async function jsonResult<T>(response: Response): Promise<T> {
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(value?.error?.message ?? 'Private media request failed. Retry the upload.');
  }
  return value as T;
}

/** Call only after creating a real backend artifact/contribution. No fixture persona IDs. */
export async function uploadPrivateMedia(
  mediaPath: string, file: Blob, signal?: AbortSignal
): Promise<MediaCompleteResponse> {
  if (!/^\/api\/nooks\/[1-9]\d*\/(artifacts\/[1-9]\d*(\/contributions\/[1-9]\d*)?|messages\/[1-9]\d*)\/media$/.test(mediaPath)) {
    throw new Error('Use the private media path of a saved Nook artifact or contribution.');
  }
  const { upload } = await jsonResult<MediaUploadResponse>(await fetch(mediaPath, {
    method: 'POST', credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contentType: file.type, byteSize: file.size })
  }));
  const form = new FormData();
  for (const [name, value] of Object.entries(upload.fields)) form.append(name, value);
  form.append('file', file, 'upload');
  // The signed policy grants only a short-lived staging upload, never bucket reads.
  const stored = await fetch(upload.url, { method: 'POST', credentials: 'omit', body: form, signal });
  if (!stored.ok) throw new Error('Private storage rejected the upload. Check the file or retry later.');
  return jsonResult<MediaCompleteResponse>(await fetch(`${mediaPath}/complete`, {
    method: 'POST', credentials: 'same-origin', signal,
    headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploadToken: upload.uploadToken })
  }));
}
