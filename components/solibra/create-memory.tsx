'use client';
import Link from 'next/link';
import { PageSkeleton, LoadingStatus } from './loading';
import { useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { useSWRConfig } from 'swr';
import type { NookResponse } from '@/lib/nooks/types';
import { createArtifactSchema, type Artifact } from '@/lib/memories/types';
import { artifactPath, attachSavedPhoto, createRealArtifact, realMemoryHref, validatePhoto, MemoryWriteError } from '@/lib/frontend/real-memories';
import { useNookData } from './use-nook-data';
import { NookRequestState } from './nook-request-state';
import { PhotoSelection } from './photo-attachment';
import { useConfirmedWrite } from './use-confirmed-write';
import { SolibraEmote } from './solibra-emote';
import { RealRecorder } from './voice/real-recorder';

export function CreateMemory({ nookId, viewerId }: { nookId: number; viewerId: number }) {
  const nook = useNookData<NookResponse>(`/api/nooks/${nookId}`, viewerId);
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const write = useConfirmedWrite();
  const [type, setType] = useState<'photo' | 'text' | 'letter' | 'audio'>('photo');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saved, setSaved] = useState<Artifact | null>(null);
  const [validation, setValidation] = useState('');
  const [notice, setNotice] = useState('');
  const [stage, setStage] = useState('');
  const [photoAttached, setPhotoAttached] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState(false);
  const [voicePending, setVoicePending] = useState(false);
  const [voiceSaved, setVoiceSaved] = useState(false);
  const voiceState = useCallback((draft: boolean, pending: boolean) => { setVoiceDraft(draft); setVoicePending(pending); }, []);
  async function refresh() {
    await Promise.all([mutate([artifactPath(nookId), viewerId]), saved ? mutate([artifactPath(nookId, saved.id), viewerId]) : Promise.resolve()]).catch(() => {});
  }
  async function upload(artifact: Artifact) {
    setStage('Uploading your photograph…');
    const result = await attachSavedPhoto(nookId, artifact.id, file!);
    setPhotoAttached(!result.alreadyAttached);
    setNotice(result.alreadyAttached ? 'A photograph is already attached. Open the memory to verify it.' : result.cleanupPending ? 'Photograph attached. Background storage cleanup is pending; no retry is needed.' : 'Your memory is saved!');
    await Promise.all([mutate([artifactPath(nookId), viewerId]), mutate([artifactPath(nookId, artifact.id), viewerId])]).catch(() => {});
    router.push(realMemoryHref(nookId, artifact.id));
  }
  async function submit() {
    if (type === 'audio' || saved || write.pending) return;
    const input = { type, title, description: description || null };
    if (!createArtifactSchema.safeParse(input).success || ((type === 'text' || type === 'letter') && !description.trim())) {
      setValidation('Add a title of 1–200 characters and a story of up to 10,000 characters. Written memories and letters need a body.'); return;
    }
    if (type === 'photo') { const invalid = validatePhoto(file); if (invalid) { setValidation(invalid); return; } }
    setValidation(''); setStage('Saving your memory…');
    await write.run(() => createRealArtifact(nookId, input), async ({ artifact }) => {
      if (artifact.creatorId !== viewerId) throw new MemoryWriteError(201, 'The creator could not be confirmed. Check your Library before retrying.', true);
      setSaved(artifact); setNotice('Memory created.');
      await mutate([artifactPath(nookId), viewerId]).catch(() => {});
      if (type === 'photo') await upload(artifact);
      else { setStage(''); setNotice('Your memory is saved!'); }
    });
  }
  const error = nook.error || write.accessError;
  if (error) return <main id="main-content" className="sol-main"><Link href="/">← Library</Link><NookRequestState error={error} retry={() => { write.clearError(); void nook.mutate(); }}/></main>;
  if (!nook.data) return <main id="main-content" className="sol-main"><PageSkeleton kind="nook" label="Opening your Nook…"/></main>;
  if (nook.data.nook.id !== nookId) return <main id="main-content" className="sol-main"><p role="alert">This Nook could not be verified.</p></main>;
  return <main id="main-content" className="sol-main real-memory-create">
    <nav className="sol-breadcrumb" aria-label="Breadcrumb"><Link href="/">Library</Link><span>/</span><Link href={`/circles/${nookId}`}>{nook.data.nook.name}</Link><span>/ Add memory</span></nav>
    <h1>A little moment, kept close.</h1><p>Add a memory to {nook.data.nook.name}. Everyone in this Nook can see it.</p>
    <form hidden={type === 'audio' && voiceSaved} className="real-memory-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <fieldset disabled={write.pending || voicePending || !!saved}><legend>What would you like to keep?</legend><div className="memory-type-options">{(['photo','text','letter','audio'] as const).map(value => <label key={value}><input type="radio" name="memory-type" disabled={voiceDraft} value={value} checked={type === value} onChange={() => setType(value)}/>{value === 'photo' ? 'Photo' : value === 'text' ? 'Written Memory' : value === 'audio' ? 'Voice Recording' : 'Letter'}</label>)}</div>
        <label>Title<input required maxLength={200} value={title} onChange={event => { setTitle(event.target.value); setValidation(''); }} placeholder="A moment worth remembering"/></label><small>{title.length} / 200</small>
        <label>{type === 'photo' || type === 'audio' ? 'Description or story (optional)' : type === 'letter' ? 'Your letter' : 'Your memory'}<textarea required={type === 'text' || type === 'letter'} maxLength={10000} rows={7} value={description} onChange={event => { setDescription(event.target.value); setValidation(''); }} placeholder="Tell the story in your own words…"/></label><small>{description.length} / 10,000</small>
      </fieldset>
      {type === 'photo' && <PhotoSelection file={file} onChange={setFile} disabled={write.pending || !!saved && !write.error}/>}
      {validation && <p role="alert">{validation}</p>}
      {write.pending && <div aria-busy="true"><LoadingStatus>{stage}</LoadingStatus></div>}
      {notice && <div className="memory-save-feedback">{saved && !write.pending && !write.error && (type === 'text' || type === 'letter' || type === 'photo' && photoAttached) && <SolibraEmote variant="celebrate" size={72}/>}<p role="status">{notice}</p></div>}
      {write.error && <div role="alert"><p>{saved ? 'Your memory was created, but its photograph was not confirmed as attached. Retry below for this same memory, or open it to check.' : write.error.message}</p>{saved && <p>{write.error.message}</p>}<Link href={`/circles/${nookId}`} onClick={() => void refresh()}>Check your Nook before retrying →</Link></div>}
      <div className="real-memory-actions">{type === 'audio' ? null : !saved ? <><button className="sol-button" disabled={write.pending} type="submit">{write.pending ? 'Saving…' : 'Create memory'}</button><Link className="sol-outline-button" href={`/circles/${nookId}`}>Cancel</Link></> : <><Link className="sol-button" href={realMemoryHref(nookId, saved.id)}>View memory →</Link>{type === 'photo' && write.error && <button className="sol-outline-button" type="button" disabled={write.pending || !file} onClick={() => void write.run(() => upload(saved), () => {})}>Retry photograph upload</button>}</>}</div>
    </form>
    {type === 'audio' && <RealRecorder nookId={nookId} viewerId={viewerId} onDraftChange={voiceState} onSaved={() => setVoiceSaved(true)} validateBeforeSave={() => {
      const message = !title.trim() ? 'Give your voice memory a title before saving.' : title.trim().length > 200 ? 'Use a title of 200 characters or fewer.' : description.trim().length > 10000 ? 'Keep the description within 10,000 characters.' : '';
      setValidation(message); return message || null;
    }} createArtifact={async () => {
      if (saved) return saved;
      if (!createArtifactSchema.safeParse({ type: 'audio', title, description }).success) throw new MemoryWriteError(400, 'Add a title of 1–200 characters and an optional description of up to 10,000 characters.');
      const { artifact } = await createRealArtifact(nookId, { type: 'audio', title, description: description || null });
      if (artifact.creatorId !== viewerId) throw new MemoryWriteError(201, 'The creator could not be confirmed. Inspect your Nook before retrying.', true);
      setSaved(artifact);
      return artifact;
    }}/>}
  </main>;
}
