'use client';
import Link from 'next/link';
import { useCallback, useState } from 'react';
import { ArrowLeft, MessagesSquare, RefreshCw, Sparkles } from 'lucide-react';
import { useSWRConfig } from 'swr';
import type { NookResponse, NookMembershipListResponse } from '@/lib/nooks/types';
import { createContributionSchema, type ArtifactResponse, type Contribution, type ContributionListResponse } from '@/lib/memories/types';
import { artifactPath, artifactMediaPath, attachSavedPhoto, createWrittenContribution, memoryAuthor, memoryTypeLabel, MemoryWriteError } from '@/lib/frontend/real-memories';
import { NookRequestError } from '@/lib/frontend/nook-api';
import { sendNookMessage } from '@/lib/frontend/real-messages';
import { useNookData } from './use-nook-data';
import { useConfirmedWrite } from './use-confirmed-write';
import { NookRequestState } from './nook-request-state';
import { PhotoSelection, PrivatePhoto } from './photo-attachment';
import { PrivateRecording } from './private-recording';
import { SolibraEmote } from './solibra-emote';
import { SavedVoice, canManageVoice } from './voice/saved-voice';
import { RealRecorder } from './voice/real-recorder';

export function RealMemoryDetails({ nookId, artifactId, viewerId }: { nookId: number; artifactId: number; viewerId: number }) {
  const nook = useNookData<NookResponse>(`/api/nooks/${nookId}`, viewerId);
  const denied = (error: unknown) => error instanceof NookRequestError && [401,403,404].includes(error.status);
  const verified = !!nook.data && !denied(nook.error) && nook.data.nook.id === nookId;
  const memory = useNookData<ArtifactResponse>(verified ? artifactPath(nookId, artifactId) : null, viewerId);
  const validMemory = verified && !!memory.data && !denied(memory.error) && memory.data.artifact.id === artifactId && memory.data.artifact.nookId === nookId;
  const people = useNookData<NookMembershipListResponse>(validMemory ? `/api/nooks/${nookId}/members` : null, viewerId);
  const perspectives = useNookData<ContributionListResponse>(validMemory ? `${artifactPath(nookId, artifactId)}/contributions` : null, viewerId);
  const { mutate } = useSWRConfig();
  const perspectiveWrite = useConfirmedWrite();
  const shareWrite = useConfirmedWrite();
  const photoWrite = useConfirmedWrite();
  const [editor, setEditor] = useState<'closed' | 'choice' | 'text' | 'voice'>('closed');
  const [voiceMounted, setVoiceMounted] = useState(false);
  const [voiceDraft, setVoiceDraft] = useState(false);
  const [voicePending, setVoicePending] = useState(false);
  const [confirmedVoice, setConfirmedVoice] = useState<{ id: number; version: string } | null>(null);
  const [savedVoiceId, setSavedVoiceId] = useState<number | null>(null);
  const voiceState = useCallback((draft: boolean, pending: boolean) => { setVoiceDraft(draft); setVoicePending(pending); }, []);
  const [resumeVoice, setResumeVoice] = useState<number | undefined>();
  const [draft, setDraft] = useState('');
  const [review, setReview] = useState(false);
  const [perspectiveNotice, setPerspectiveNotice] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [shareText, setShareText] = useState<string | null>(null);
  const [shareNotice, setShareNotice] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [photoNotice, setPhotoNotice] = useState('');
  const readError = [nook, memory, people, perspectives].find(resource => resource.error && (denied(resource.error) || !resource.data))?.error;
  const error = readError || perspectiveWrite.accessError || shareWrite.accessError || photoWrite.accessError;
  async function refresh() {
    perspectiveWrite.clearError(); shareWrite.clearError(); photoWrite.clearError();
    await Promise.all([nook.mutate(), memory.mutate(), people.mutate(), perspectives.mutate()]).catch(() => {});
  }
  if (error || !validMemory || !people.data || !perspectives.data) return <main id="main-content" className="sol-main"><Link href={`/circles/${nookId}`}>← Back to Nook</Link>{error ? <NookRequestState error={error} retry={() => void refresh()}/> : nook.data && !verified || memory.data && verified && !validMemory ? <p role="alert">This memory could not be verified.</p> : <p role="status">Opening your memory…</p>}{draft && <p>Your unsent perspective is kept while this page stays open.</p>}</main>;
  const artifact = memory.data!.artifact;
  const members = people.data.members.filter(member => member.nookId === nookId);
  const contributions = perspectives.data.contributions.filter(item => item.artifactId === artifactId).sort((a,b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || a.id - b.id);
  const voices = contributions.filter(item => item.type === 'audio');
  const hasRecording = (item: Contribution) => !!item.audioStorageKey || confirmedVoice?.id === item.id && confirmedVoice.version === item.updatedAt;
  const primaryVoice = artifact.type === 'audio' && !artifact.mediaStorageKey ? voices.find(item => item.authorId === artifact.creatorId && hasRecording(item)) || voices.find(hasRecording) : undefined;
  function openVoice(id?: number) {
    if (voicePending || perspectiveWrite.pending) return;
    if (resumeVoice !== id && voiceDraft && !window.confirm('Discard your local recording to start a different voice perspective? Any saved draft remains.')) return;
    setResumeVoice(id); setVoiceMounted(true); setEditor('voice');
  }
  async function voiceSaved(contribution: Contribution) {
    setConfirmedVoice({ id: contribution.id, version: contribution.updatedAt }); setSavedVoiceId(contribution.id);
    setPerspectiveNotice('Recording saved.'); setEditor('closed'); setVoiceMounted(false); setVoiceDraft(false); setVoicePending(false); setResumeVoice(undefined);
    await perspectives.mutate(value => ({ contributions: [...(value?.contributions || []).filter(item => item.id !== contribution.id), contribution] }), { revalidate: false });
    void perspectives.mutate().catch(() => {});
  }
  function renderVoice(item: Contribution) {
    return <div key={item.id}><SavedVoice contribution={item} confirmedMedia={confirmedVoice?.id === item.id && confirmedVoice.version === item.updatedAt} nookId={nookId} artifactId={artifactId} viewerId={viewerId} authorName={memoryAuthor(item.authorId, nookId, members)} canManage={canManageVoice(viewerId, item.authorId, nook.data!.nook.role)}/>{!hasRecording(item) && item.authorId === viewerId && <button className="sol-outline-button" type="button" disabled={voicePending} onClick={() => openVoice(item.id)}>Resume this voice draft</button>}</div>;
  }
  const canAttachPhoto = artifact.type === 'photo' && !artifact.mediaStorageKey && (artifact.creatorId === viewerId || nook.data!.nook.role === 'owner');
  const shareValue = shareText ?? `Does anyone remember “${artifact.title}”?`;
  async function addPerspective() {
    if (!review) return;
    await perspectiveWrite.run(() => createWrittenContribution(nookId, artifactId, { type: 'text', content: draft }), async ({ contribution }) => {
      if (contribution.authorId !== viewerId) throw new MemoryWriteError(201, 'The author could not be confirmed. Refresh before retrying.', true);
      setDraft(''); setReview(false); setPerspectiveNotice('Your perspective is saved.');
      await perspectives.mutate(current => ({ contributions: [...(current?.contributions || []).filter(item => item.id !== contribution.id), contribution] }), { revalidate: false });
      await perspectives.mutate().catch(() => setPerspectiveNotice('Perspective saved. Refresh to check the latest history; don’t submit it again.'));
    });
  }
  async function share() {
    await shareWrite.run(() => sendNookMessage(nookId, { content: shareValue, artifactId }), async ({ message }) => {
      if (message.senderId !== viewerId) throw new MemoryWriteError(201, 'The sender could not be confirmed. Refresh the conversation before retrying.', true);
      setShareNotice('Shared in your Nook’s group conversation.');
      await mutate([`/api/nooks/${nookId}/messages`, viewerId]).catch(() => {});
    });
  }
  async function attach() {
    if (!file) return;
    await photoWrite.run(() => attachSavedPhoto(nookId, artifactId, file), async result => {
      setPhotoNotice(result.alreadyAttached ? 'A photograph is already attached. Refresh to view it.' : result.cleanupPending ? 'Photograph attached. Storage cleanup is pending; no retry is needed.' : 'Photograph attached.');
      await Promise.all([memory.mutate(), mutate([artifactPath(nookId), viewerId])]).catch(() => {});
      setFile(null);
    });
  }
  return <main id="main-content" className="sol-main memory-details real-memory-details">
    <nav className="sol-breadcrumb" aria-label="Breadcrumb"><Link href="/">Library</Link><span>/</span><Link href={`/circles/${nookId}`}>{nook.data!.nook.name}</Link><span>/</span><span aria-current="page">{artifact.title}</span></nav>
    <div className="memory-detail-introduction"><div><h1>{artifact.title}</h1><p>{memoryTypeLabel(artifact.type)} · Added by <strong className="memory-creator">{memoryAuthor(artifact.creatorId, nookId, members)}</strong> · <time dateTime={artifact.createdAt}>{new Date(artifact.createdAt).toLocaleDateString()}</time></p></div><button className="sol-outline-button" aria-expanded={shareOpen} onClick={() => { setShareOpen(value => !value); }}>Share in group conversation</button></div>
    <div className="real-memory-actions"><Link href={`/circles/${nookId}`} className="sol-outline-button"><ArrowLeft size={17} aria-hidden="true"/>Back to Nook</Link><Link href={`/messages/${nookId}`} className="sol-outline-button"><MessagesSquare size={17} aria-hidden="true"/>Group conversation</Link><button className="sol-outline-button" onClick={() => void refresh()}><RefreshCw size={17} aria-hidden="true"/>Refresh memory</button></div>
    {shareOpen && <section className="real-memory-form" aria-label="Share in group conversation"><h2>Bring your people into the story.</h2><p>This message is shared with everyone in {nook.data!.nook.name}.</p><form onSubmit={event => { event.preventDefault(); void share(); }}><label>Message<textarea rows={3} required maxLength={5000} value={shareValue} disabled={shareWrite.pending || !!shareNotice} onChange={event => setShareText(event.target.value)}/></label><small>{shareValue.length} / 5,000</small>{shareWrite.error && <p role="alert">{shareWrite.error.message} Check the conversation before retrying.</p>}{shareNotice ? <p role="status">{shareNotice} <Link href={`/messages/${nookId}`}>Open conversation →</Link></p> : <button type="submit" className="sol-button" disabled={shareWrite.pending || !shareValue.trim()}>{shareWrite.pending ? 'Sharing…' : 'Share memory'}</button>}</form></section>}
    <div className="memory-detail-grid">
      <section className="memory-original" aria-label="The original memory">
        {artifact.type === 'photo' && (artifact.mediaStorageKey ? <figure><PrivatePhoto key={artifact.updatedAt} src={`${artifactMediaPath(artifact)}?v=${encodeURIComponent(artifact.updatedAt)}`} title={artifact.title}/><figcaption>{artifact.title}</figcaption></figure> : <div className="real-media-placeholder"><p>No photograph is attached yet.</p></div>)}
        {artifact.type === 'audio' && (artifact.mediaStorageKey ? <PrivateRecording key={artifact.updatedAt} src={`${artifactMediaPath(artifact)}?v=${encodeURIComponent(artifact.updatedAt)}`} label={`Original recording: ${artifact.title}`}/> : primaryVoice ? <section className="original-voice-memory" aria-label="Original voice memory"><h2>Original recording</h2>{renderVoice(primaryVoice)}</section> : <p>No recording is attached yet. Record a voice perspective below, or resume your saved draft.</p>)}
        <h2>{artifact.type === 'letter' ? 'A letter, kept close.' : 'The story behind it.'}</h2>{artifact.description ? <p className="memory-long-story">{artifact.description}</p> : <div className="memory-story-empty"><SolibraEmote variant="reading" size={80}/><p className="memory-long-story">This memory is waiting for its story.</p></div>}
        {canAttachPhoto && <section className="real-memory-form" aria-label="Attach missing photograph"><h3>Add its photograph</h3><PhotoSelection file={file} onChange={setFile} disabled={photoWrite.pending}/><button className="sol-outline-button" disabled={photoWrite.pending || !file} onClick={() => void attach()}>{photoWrite.pending ? 'Attaching photograph…' : photoWrite.error ? 'Retry photograph upload' : 'Attach photograph'}</button>{photoWrite.error && <p role="alert">{photoWrite.error.message} The memory is still saved. Retry uses this same memory.</p>}</section>}
        {photoNotice && <p role="status">{photoNotice}</p>}
        <div className="memory-story-divider" aria-hidden="true"><span/><Sparkles size={18}/><span/></div><section className="family-perspectives" aria-labelledby="real-perspectives-title"><h2 id="real-perspectives-title">One memory. Many points of view.</h2>
          {!contributions.some(item => item.type === 'text') && <p>Be the first to add a written perspective.</p>}
          {contributions.filter(item => item.type === 'text').map(item => <article className="real-perspective" key={item.id}><h3>{memoryAuthor(item.authorId, nookId, members)}</h3><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time><p>{item.content}</p></article>)}
          <button className="sol-outline-button" aria-expanded={editor !== 'closed'} disabled={voicePending || perspectiveWrite.pending} onClick={() => setEditor(editor === 'closed' ? 'choice' : 'closed')}>Add your perspective</button>
          {editor !== 'closed' && <div className="perspective-choices" role="group" aria-label="Choose your perspective"><button className="sol-outline-button" type="button" disabled={voicePending || perspectiveWrite.pending} aria-pressed={editor === 'text'} onClick={() => setEditor('text')}>Write a perspective</button><button className="sol-outline-button" type="button" disabled={voicePending || perspectiveWrite.pending} aria-pressed={editor === 'voice'} onClick={() => openVoice()}>Record a voice perspective</button>{editor === 'choice' && <button className="sol-text-link" type="button" onClick={() => setEditor('closed')}>Cancel</button>}</div>}
          {voiceMounted && <div hidden={editor !== 'voice'}><RealRecorder key={`${viewerId}:${artifactId}:${resumeVoice || 'new'}`} mode="perspective" active={editor === 'voice'} nookId={nookId} artifactId={artifactId} contributionId={resumeVoice} viewerId={viewerId} onDraftChange={voiceState} onSaved={voiceSaved} onClose={() => setEditor('closed')}/></div>}
          {editor === 'text' && <form className="real-memory-form" onSubmit={event => { event.preventDefault(); if (!review) { if (createContributionSchema.safeParse({ type: 'text', content: draft }).success) setReview(true); } else void addPerspective(); }}>
            <label>Your recollection<textarea required maxLength={20000} rows={6} value={draft} readOnly={review} disabled={perspectiveWrite.pending} onChange={event => setDraft(event.target.value)}/></label><small>{draft.length} / 20,000</small>{review && <p>Review your words above. They will be attributed to your authenticated account and visible to this Nook.</p>}
            <div className="real-memory-actions"><button className="sol-button" type="submit" disabled={perspectiveWrite.pending || !draft.trim()}>{perspectiveWrite.pending ? 'Saving…' : review ? 'Save perspective' : 'Review perspective'}</button><button className="sol-outline-button" type="button" disabled={perspectiveWrite.pending} onClick={() => review ? setReview(false) : setEditor('closed')}>{review ? 'Edit' : 'Cancel'}</button></div>
            {perspectiveWrite.error && <p role="alert">{perspectiveWrite.error.message} Your draft is kept. Refresh this memory before retrying.</p>}
          </form>}{perspectiveNotice && <p role="status">{perspectiveNotice} {savedVoiceId && <a className="sol-text-link" href={`#voice-${savedVoiceId}`}>View your saved voice →</a>}</p>}
        </section>
      </section>
      <aside id="real-original-voices" className="voice-story-panel real-voices" aria-label="Original voices"><h2>In their own words.</h2>{!voices.some(item => item.id !== primaryVoice?.id) && <p>Add another voice to this memory.</p>}{voices.filter(item => item.id !== primaryVoice?.id).map(renderVoice)}</aside>
    </div>
  </main>;
}
