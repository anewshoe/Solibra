import {
  createArtifactSchema, createContributionSchema,
  type Artifact, type ArtifactResponse, type ContributionResponse,
  type CreateArtifactRequest, type CreateContributionRequest
} from '@/lib/memories/types';
import type { NookMembership } from '@/lib/nooks/types';
import { MAX_IMAGE_BYTES } from '@/lib/media/types';
import { uploadPrivateMedia } from '@/lib/frontend/media-client';
import { NookRequestError, nookRequest } from './nook-api';
import { numericNookId } from './real-nooks';

export function resourceId(id: number) {
  if (numericNookId(String(id)) !== id) throw new Error('Use a real numeric resource ID.');
  return id;
}
export function artifactPath(nookId: number, artifactId?: number) {
  return `/api/nooks/${resourceId(nookId)}/artifacts${artifactId === undefined ? '' : `/${resourceId(artifactId)}`}`;
}
export function realMemoryHref(nookId: number, artifactId: number) {
  return `/circles/${resourceId(nookId)}/memories/${resourceId(artifactId)}`;
}
export function artifactMediaPath(artifact: Pick<Artifact, 'id' | 'nookId'>) {
  return `${artifactPath(artifact.nookId, artifact.id)}/media`;
}
export const memoryTypeLabel = (type: string) => ({ photo: 'Photograph', text: 'Written memory', letter: 'Letter', audio: 'Audio', other: 'Memory' }[type] || 'Memory');
export function memoryAuthor(userId: number, nookId: number, members: NookMembership[]) {
  const membership = members.find(member => member.nookId === nookId && member.userId === userId);
  return membership ? membership.user.name?.trim() || 'Nook member' : 'Former member';
}
export function validatePhoto(file: Pick<File, 'type' | 'size'> | null): string | null {
  if (!file) return 'Choose a photograph.';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPEG, PNG, or WebP photograph. HEIC, SVG, and GIF aren’t supported.';
  if (file.size < 16 || file.size > MAX_IMAGE_BYTES) return 'Choose a photograph between 16 and 5,000,000 bytes.';
  return null;
}
export class MemoryWriteError extends NookRequestError {
  constructor(status: number, message: string, public uncertain = false) { super(status, message); }
}
async function confirmedPost<T>(path: string, body: unknown, valid: (value: T) => boolean): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new MemoryWriteError(0, 'The result is unknown. Check your Nook before retrying; this may already have been saved.', true);
  }
  if (response.status !== 201) {
    const message = ({ 400: 'Check the fields and their character limits.', 401: 'Please sign in again.', 403: 'You don’t have permission for this action.', 404: 'This memory or Nook is unavailable, or your membership has ended.', 409: 'This resource has changed. Refresh before retrying.', 413: 'The selected file is too large.', 415: 'This file format is not supported.', 503: 'The service is unavailable. Check your Nook before retrying.' } as Record<number,string>)[response.status] || 'The result could not be confirmed. Check your Nook before retrying.';
    throw new MemoryWriteError(response.status, message, response.ok || response.status >= 500);
  }
  const value = await response.json().catch(() => null);
  if (!value || !valid(value)) throw new MemoryWriteError(201, 'The saved result could not be verified. Check your Nook before retrying.', true);
  return value;
}
const validId = (id: number) => numericNookId(String(id)) === id;
export async function createRealArtifact(nookId: number, input: CreateArtifactRequest) {
  const body = createArtifactSchema.parse(input);
  return confirmedPost<ArtifactResponse>(artifactPath(nookId), body, value => {
    const a = value.artifact;
    return !!a && validId(a.id) && a.nookId === nookId && validId(a.creatorId) && a.type === body.type && a.title === body.title && a.description === (body.description ?? null);
  });
}
export async function createWrittenContribution(nookId: number, artifactId: number, input: CreateContributionRequest) {
  const body = createContributionSchema.parse(input);
  if (body.type !== 'text') throw new Error('Only written perspectives are connected here.');
  return confirmedPost<ContributionResponse>(`${artifactPath(nookId, artifactId)}/contributions`, body, value => {
    const c = value.contribution;
    return !!c && validId(c.id) && c.artifactId === artifactId && validId(c.authorId) && c.type === 'text' && c.content === body.content;
  });
}
export async function createAudioContribution(nookId: number, artifactId: number) {
  return confirmedPost<ContributionResponse>(`${artifactPath(nookId, artifactId)}/contributions`, createContributionSchema.parse({ type: 'audio' }), value => {
    const c = value.contribution;
    return !!c && validId(c.id) && c.artifactId === artifactId && validId(c.authorId) && c.type === 'audio';
  });
}

/** A retry checks the existing resource first: never create a second artifact or
 * replace an attachment just because the completion acknowledgment was lost. */
export async function attachSavedPhoto(nookId: number, artifactId: number, file: File) {
  const invalid = validatePhoto(file);
  if (invalid) throw new MemoryWriteError(400, invalid);
  const { artifact } = await nookRequest<ArtifactResponse>(artifactPath(nookId, artifactId));
  if (artifact.id !== artifactId || artifact.nookId !== nookId || artifact.type !== 'photo') throw new MemoryWriteError(404, 'This photograph could not be verified.');
  if (artifact.mediaStorageKey) return { alreadyAttached: true, cleanupPending: false };
  const result = await uploadPrivateMedia(artifactMediaPath(artifact), file);
  if (result.media?.url !== artifactMediaPath(artifact) || result.media.byteSize !== file.size || result.media.contentType !== file.type) throw new MemoryWriteError(201, 'Attachment result could not be verified. Refresh this memory before retrying.', true);
  return { alreadyAttached: false, cleanupPending: result.cleanupPending };
}
