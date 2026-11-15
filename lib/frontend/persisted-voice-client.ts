import type { Artifact, Contribution, ContributionResponse } from '@/lib/memories/types';
import { processContributionSchema, translateContributionSchema, type PersistedVoiceResponse, type PersistedVoicePartialFailure } from '@/lib/voice/persistence-types';
import { validateMedia, matchesMediaSignature } from '@/lib/media/validation';
import { uploadPrivateMedia } from './media-client';
import { nookRequest, NookRequestError } from './nook-api';
import { artifactPath, createAudioContribution, resourceId, MemoryWriteError } from './real-memories';

export function contributionPath(nookId: number, artifactId: number, contributionId: number) {
  return `${artifactPath(nookId, artifactId)}/contributions/${resourceId(contributionId)}`;
}
export async function validateRecording(blob: Blob) {
  const media = validateMedia('audio', blob.type, blob.size);
  if (!matchesMediaSignature(new Uint8Array(await blob.slice(0,32).arrayBuffer()), blob.type)) throw new Error('This recording has an unsupported audio container. Record again using another supported browser.');
  return media;
}
export class VoiceProcessingError extends NookRequestError {
  constructor(status: number, message: string, public contribution?: Contribution, public uncertain = false) { super(status, message); }
}
function validContribution(c: Contribution | undefined, artifactId: number, id: number) {
  return !!c && c.id === id && c.artifactId === artifactId && c.type === 'audio' && Number.isInteger(c.authorId) && c.authorId > 0;
}
export async function processSavedVoice(nookId: number, artifactId: number, id: number, targetLanguage: string, translationOnly: boolean): Promise<PersistedVoiceResponse> {
  const body = translationOnly ? translateContributionSchema.parse({ targetLanguage }) : processContributionSchema.parse({ targetLanguage, reprocess: false });
  let response: Response;
  try {
    response = await fetch(`${contributionPath(nookId, artifactId, id)}/${translationOnly ? 'translations' : 'process'}`, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(185_000)
    });
  } catch { throw new VoiceProcessingError(0, 'The processing result is unknown. Your saved recording is safe. Refresh before retrying; processing may still be underway.', undefined, true); }
  const value = await response.json().catch(() => null);
  if (!response.ok) {
    const partial = value as PersistedVoicePartialFailure | null;
    const contribution = partial?.stage === 'translation' && partial.status === response.status && validContribution(partial.contribution, artifactId, id) && typeof partial.contribution.originalTranscript === 'string' ? partial.contribution : undefined;
    const message = ({400:'Choose a supported translation language.',401:'Please sign in again.',403:'Only the author or a Nook owner can process or translate this voice.',404:'This voice is unavailable or your membership has ended.',409:'Processing is already underway, or the saved recording/transcript has changed. Refresh; an interrupted processing lease lasts three minutes.',413:'This recording exceeds the audio size limit.',415:'This recording format cannot be processed.',422:'No usable transcript was returned. The saved recording remains available.'} as Record<number,string>)[response.status] || (contribution ? 'The original transcript was saved, but translation failed. Retry translation without uploading or transcribing again.' : 'Voice processing did not finish. Your saved recording remains available. Refresh before retrying.');
    throw new VoiceProcessingError(response.status, message, contribution);
  }
  const result = value as PersistedVoiceResponse;
  if (response.status !== 200 || !validContribution(result?.contribution, artifactId, id) || result.translation?.contributionId !== id || result.translation.targetLanguage !== body.targetLanguage || typeof result.translation.translatedText !== 'string') throw new VoiceProcessingError(response.status, 'The result could not be verified. Refresh this saved voice before retrying.', undefined, true);
  return result;
}

/** Temporary workflow state only; confirmed IDs are never recreated on retry. */
export class VoiceSaveFlow {
  artifactId?: number;
  contributionId?: number;
  saved = false;
  uncertainStage: 'artifact' | 'contribution' | null = null;
  busy = false;
  constructor(readonly nookId: number, readonly viewerId: number, artifactId?: number, contributionId?: number) {
    resourceId(nookId); if (artifactId) resourceId(artifactId); if (contributionId) resourceId(contributionId);
    this.artifactId = artifactId; this.contributionId = contributionId;
  }
  async save(blob: Blob, createArtifact: (() => Promise<Artifact>) | undefined, changed: (stage: string) => void, alive = () => true) {
    if (this.busy || this.saved || this.uncertainStage) return;
    this.busy = true;
    let stage: 'artifact' | 'contribution' | 'upload' = 'artifact';
    try {
      const media = await validateRecording(blob);
      if (!alive()) return;
      if (!this.artifactId) {
        changed('Creating your voice memory…');
        if (!createArtifact) throw new Error('Choose a saved memory first.');
        const artifact = await createArtifact();
        if (artifact.nookId !== this.nookId || artifact.creatorId !== this.viewerId || artifact.type !== 'audio') throw new MemoryWriteError(201, 'The created memory could not be verified. Check your Nook.', true);
        this.artifactId = resourceId(artifact.id);
      }
      if (!alive()) return;
      stage = 'contribution';
      if (!this.contributionId) {
        changed('Creating your voice contribution…');
        const { contribution } = await createAudioContribution(this.nookId, this.artifactId);
        if (contribution.authorId !== this.viewerId) throw new MemoryWriteError(201, 'The contribution author could not be verified. Refresh this memory.', true);
        this.contributionId = contribution.id;
      }
      if (!alive()) return;
      stage = 'upload'; changed('Attaching your recording…');
      const path = contributionPath(this.nookId, this.artifactId, this.contributionId);
      const current = await nookRequest<ContributionResponse>(path);
      if (!validContribution(current.contribution, this.artifactId, this.contributionId) || current.contribution.authorId !== this.viewerId) throw new Error('The saved voice could not be verified.');
      if (!current.contribution.audioStorageKey) {
        const result = await uploadPrivateMedia(`${path}/media`, blob);
        if (result.media?.url !== `${path}/media` || result.media.byteSize !== blob.size || result.media.contentType !== media.contentType) throw new Error('Attachment result could not be verified. Refresh before retrying.');
      }
      this.saved = true; changed('Recording saved. Transcription and translation are a separate next step.');
    } catch (cause) {
      if (stage !== 'upload' && cause instanceof MemoryWriteError && cause.uncertain) this.uncertainStage = stage;
      throw cause;
    } finally { this.busy = false; }
  }
}
