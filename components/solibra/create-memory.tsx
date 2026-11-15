'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useSWRConfig } from 'swr';
import type { NookResponse } from '@/lib/nooks/types';
import { createArtifactSchema, type Artifact } from '@/lib/memories/types';
import { artifactPath, attachSavedPhoto, createRealArtifact, realMemoryHref, validatePhoto, MemoryWriteError } from '@/lib/frontend/real-memories';
import { useNookData } from './use-nook-data';
import { NookRequestState } from './nook-request-state';
import { PhotoSelection } from './photo-attachment';
import { useConfirmedWrite } from './use-confirmed-write';

export function CreateMemory({ nookId, viewerId }: { nookId: number; viewerId: number }) {
  const nook = useNookData<NookResponse>(`/api/nooks/${nookId}`, viewerId);
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const write = useConfirmedWrite();
  const [type, setType] = useState<'photo' | 'text' | 'letter'>('photo');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saved, setSaved] = useState<Artifact | null>(null);
  const [validation, setValidation] = useState('');
  const [notice, setNotice] = useState('');
  const [stage, setStage] = useState('');
  async function refresh() {
    await Promise.all([mutate([artifactPath(nookId), viewerId]), saved ? mutate([artifactPath(nookId, saved.id), viewerId]) : Promise.resolve()]).catch(() => {});
  }
  async function upload(artifact: Artifact) {
    setStage('Attaching your photograph…');
    const result = await attachSavedPhoto(nookId, artifact.id, file!);
    setNotice(result.alreadyAttached ? 'A photograph is already attached. Open the memory to verify it.' : result.cleanupPending ? 'Photograph attached. Background storage cleanup is pending; no retry is needed.' : 'Photograph attached. Your memory is ready.');
    await Promise.all([mutate([artifactPath(nookId), viewerId]), mutate([artifactPath(nookId, artifact.id), viewerId])]).catch(() => {});
    router.push(realMemoryHref(nookId, artifact.id));
  }
  async function submit() {
    if (saved || write.pending) return;
    const input = { type, title, description: description || null };
    if (!createArtifactSchema.safeParse(input).success || (type !== 'photo' && !description.trim())) {
      setValidation('Add a title of 1–200 characters and a story of up to 10,000 characters. Written memories and letters need a body.'); return;
    }
    if (type === 'photo') { const invalid = validatePhoto(file); if (invalid) { setValidation(invalid); return; } }
    setValidation(''); setStage('Saving your memory…');
    await write.run(() => createRealArtifact(nookId, input), async ({ artifact }) => {
      if (artifact.creatorId !== viewerId) throw new MemoryWriteError(201, 'The creator could not be confirmed. Check your Library before retrying.', true);
      setSaved(artifact); setNotice('Memory created.');
      await mutate([artifactPath(nookId), viewerId]).catch(() => {});
      if (type === 'photo') await upload(artifact);
      else { setStage(''); setNotice('Your memory is saved and ready to open.'); }
    });
  }
  const error = nook.error || write.accessError;
  if (error) return <main id="main-content" className="sol-main"><Link href="/">← Library</Link><NookRequestState error={error} retry={() => { write.clearError(); void nook.mutate(); }}/></main>;
  if (!nook.data) return <main id="main-content" className="sol-main"><p role="status">Opening your Nook…</p></main>;
  if (nook.data.nook.id !== nookId) return <main id="main-content" className="sol-main"><p role="alert">This Nook could not be verified.</p></main>;
  return <main id="main-content" className="sol-main real-memory-create">
    <nav className="sol-breadcrumb" aria-label="Breadcrumb"><Link href="/">Library</Link><span>/</span><Link href={`/circles/${nookId}`}>{nook.data.nook.name}</Link><span>/ Add memory</span></nav>
    <h1>A little moment, kept close.</h1><p>Add a memory to {nook.data.nook.name}. Everyone in this Nook can see it.</p>
    <form className="real-memory-form" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <fieldset disabled={write.pending || !!saved}><legend>What would you like to keep?</legend><div className="memory-type-options">{(['photo','text','letter'] as const).map(value => <label key={value}><input type="radio" name="memory-type" value={value} checked={type === value} onChange={() => setType(value)}/>{value === 'photo' ? 'Photo' : value === 'text' ? 'Written Memory' : 'Letter'}</label>)}</div>
        <label>Title<input required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="A moment worth remembering"/></label><small>{title.length} / 200</small>
        <label>{type === 'photo' ? 'Description or story (optional)' : type === 'letter' ? 'Your letter' : 'Your memory'}<textarea required={type !== 'photo'} maxLength={10000} rows={7} value={description} onChange={event => setDescription(event.target.value)} placeholder="Tell the story in your own words…"/></label><small>{description.length} / 10,000</small>
      </fieldset>
      {type === 'photo' && <PhotoSelection file={file} onChange={setFile} disabled={write.pending || !!saved && !write.error}/>}
      {validation && <p role="alert">{validation}</p>}
      {write.pending && <p role="status">{stage}</p>}
      {notice && <p role="status">{notice}</p>}
      {write.error && <div role="alert"><p>{saved ? 'Your memory was created, but its photograph was not confirmed as attached. Retry below for this same memory, or open it to check.' : write.error.message}</p>{saved && <p>{write.error.message}</p>}<Link href={`/circles/${nookId}`} onClick={() => void refresh()}>Check your Nook before retrying →</Link></div>}
      <div className="real-memory-actions">{!saved ? <><button className="sol-button" disabled={write.pending} type="submit">{write.pending ? 'Saving…' : 'Create memory'}</button><Link className="sol-outline-button" href={`/circles/${nookId}`}>Cancel</Link></> : <><Link className="sol-button" href={realMemoryHref(nookId, saved.id)}>View memory →</Link>{type === 'photo' && write.error && <button className="sol-outline-button" type="button" disabled={write.pending || !file} onClick={() => void write.run(() => upload(saved), () => {})}>Retry photograph upload</button>}</>}</div>
    </form>
  </main>;
}
