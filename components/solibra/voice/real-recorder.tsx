'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { Mic, Square } from 'lucide-react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import type { Artifact, ArtifactListResponse, Contribution, ContributionListResponse, ContributionResponse } from '@/lib/memories/types';
import { contributionPath, VoiceSaveFlow } from '@/lib/frontend/persisted-voice-client';
import { artifactPath, realMemoryHref } from '@/lib/frontend/real-memories';
import { nookRequest } from '@/lib/frontend/nook-api';
import { PrivateRecording } from '../private-recording';
import { SavedVoice } from './saved-voice';
import { formatDuration } from './use-voice-preview';

export function RealRecorder({ nookId, viewerId, artifactId, contributionId, createArtifact, validateBeforeSave, onDraftChange, onSaved, onClose, active = true, mode = 'memory' }: {
  nookId: number; viewerId: number; artifactId?: number; contributionId?: number;
  createArtifact?: () => Promise<Artifact>; validateBeforeSave?: () => string | null;
  onDraftChange?: (hasDraft: boolean, pending: boolean) => void;
  onSaved?: (contribution: Contribution) => void | Promise<void>; onClose?: () => void;
  active?: boolean; mode?: 'memory' | 'perspective';
}) {
  const recorder = useAudioRecorder();
  const flow = useRef(new VoiceSaveFlow(nookId, viewerId, artifactId, contributionId)).current;
  const [state, setState] = useState(flow.snapshot());
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [drafts, setDrafts] = useState<Contribution[]>([]);
  const [memories, setMemories] = useState<Artifact[]>([]);
  const [done, setDone] = useState(false);
  const mounted = useRef(true);
  const notified = useRef<number | undefined>(undefined);
  const { mutate } = useSWRConfig();
  const capturing = ['requesting','recording','stopping'].includes(recorder.status);
  const sync = () => { if (mounted.current) setState(flow.snapshot()); };
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!active && recorder.status === 'recording') recorder.stopRecording();
    if (!active && recorder.status === 'requesting') recorder.discardRecording();
  }, [active, recorder.status, recorder.stopRecording, recorder.discardRecording]);
  useEffect(() => { onDraftChange?.(capturing || !!recorder.audioBlob, state.busy); }, [capturing, recorder.audioBlob, state.busy, onDraftChange]);
  async function saved() {
    sync();
    if (!mounted.current || !flow.saved || !flow.contribution || !flow.artifactId) return;
    if (notified.current !== flow.contribution.id) {
      notified.current = flow.contribution.id;
      try { await onSaved?.(flow.contribution); } catch { if (mounted.current) setError('Recording saved. Refresh the memory to update its list; don’t upload again.'); }
    }
    if (mounted.current) void Promise.all([mutate([artifactPath(nookId), viewerId]), mutate([artifactPath(nookId, flow.artifactId), viewerId])]).catch(() => {});
  }
  async function save() {
    if (flow.busy || !recorder.audioBlob) return;
    const invalid = validateBeforeSave?.();
    if (invalid) { setError(invalid); return; }
    setError('');
    try { await flow.save(recorder.audioBlob, createArtifact, sync, () => mounted.current); await saved(); }
    catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'Recording could not be saved. Your local audio is kept.'); }
    finally { sync(); }
  }
  async function refresh() {
    if (refreshing || flow.busy) return;
    setRefreshing(true); setError('');
    try {
      if (!flow.artifactId) {
        const list = await nookRequest<ArtifactListResponse>(artifactPath(nookId));
        if (mounted.current) setMemories(list.artifacts.filter(a => a.nookId === nookId && a.creatorId === viewerId && a.type === 'audio' && !a.mediaStorageKey));
      } else if (flow.contributionId) {
        const { contribution } = await nookRequest<ContributionResponse>(contributionPath(nookId, flow.artifactId, flow.contributionId));
        if (contribution.id !== flow.contributionId || contribution.artifactId !== flow.artifactId || contribution.authorId !== viewerId || contribution.type !== 'audio') throw new Error('This saved voice could not be verified.');
        if (!mounted.current) return;
        flow.contribution = contribution;
        if (contribution.audioStorageKey) flow.saved = true;
        await saved();
      } else {
        const list = await nookRequest<ContributionListResponse>(`${artifactPath(nookId, flow.artifactId)}/contributions`);
        if (mounted.current) setDrafts(list.contributions.filter(c => c.artifactId === flow.artifactId && c.authorId === viewerId && c.type === 'audio'));
      }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'Unable to refresh. Your recording is kept.'); }
    finally { if (mounted.current) { setRefreshing(false); sync(); } }
  }
  async function recover(id: number, kind: 'artifact' | 'contribution') {
    setRefreshing(true); setError('');
    try {
      if (kind === 'artifact') {
        const own = await flow.resumeArtifact(id);
        if (!mounted.current) return;
        setDrafts(own); setMemories([]);
      } else { await flow.resumeContribution(id); await saved(); }
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : 'Unable to resume this draft.'); }
    finally { if (mounted.current) { setRefreshing(false); sync(); } }
  }
  function discard(reRecord: boolean) {
    if (recorder.audioBlob && !window.confirm('Discard this unsaved local recording? Any saved memory or voice draft will remain.')) return;
    recorder.discardRecording(); setError('');
    if (reRecord) void recorder.startRecording();
  }
  const canChangeRecording = !state.busy && !state.saved && !state.uploadAttempted && !state.uncertainStage;
  const step = done ? 3 : state.saved ? 2 : recorder.audioBlob ? 1 : 0;
  return <section className="real-memory-form real-recorder" aria-label="Record a saved voice">
    {mode === 'memory' && <ol className="voice-steps" aria-label="Voice memory progress">{['Record','Save','Transcribe & Translate','Done'].map((label,index) => <li key={label} aria-current={step === index ? 'step' : undefined}>{label}</li>)}</ol>}
    {!state.saved ? <><h3>Tell it in your own words.</h3><p>Any language. Your recording stays on this page until you save it.</p>
      <div className="voice-recording-status">{recorder.status === 'recording' && <span className="recording-dot" aria-hidden="true"/>}<output aria-label="Recording duration">{formatDuration(recorder.elapsedMs)}</output><span>3 minutes / 4 MiB maximum</span></div>
      <div className="real-memory-actions">{recorder.status === 'recording' ? <button className="sol-button" type="button" onClick={recorder.stopRecording}><Square size={16}/>Stop recording</button> : <button className="sol-outline-button" type="button" disabled={capturing || !canChangeRecording} onClick={() => recorder.audioBlob ? discard(true) : void recorder.startRecording()}><Mic size={16}/>{recorder.status === 'requesting' ? 'Waiting for microphone…' : recorder.status === 'stopping' ? 'Finishing recording…' : recorder.audioBlob ? 'Re-record' : 'Record voice'}</button>}{recorder.audioBlob && canChangeRecording && <button className="sol-outline-button" type="button" onClick={() => discard(false)}>Discard</button>}</div>
      {recorder.audioUrl && <PrivateRecording src={recorder.audioUrl} label="Your local recording preview"/>}
      {recorder.error && <p role="alert">{recorder.error}</p>}{recorder.notice && <p role="status">{recorder.notice}</p>}
      {recorder.audioBlob && <button className="sol-button" type="button" disabled={capturing || state.busy || refreshing || !!state.uncertainStage} onClick={() => void save()}>{state.busy ? 'Saving…' : error && state.artifactId ? 'Retry Save Recording' : 'Save Recording'}</button>}
    </> : <><p className="voice-success" role="status">Recording saved.</p>{mode === 'memory' && state.contribution && <SavedVoice contribution={state.contribution} confirmedMedia nookId={nookId} artifactId={state.artifactId!} viewerId={viewerId} authorName="Your recording" canManage initiallyExpanded guided onProcessed={() => setDone(true)}/>}</>}
    {error && <p role="alert">{error}</p>}
    {!state.saved && (error || state.uncertainStage) && <details className="voice-recovery"><summary>Help with saving</summary><p>Your local audio and confirmed record IDs are kept. An uncertain creation is never repeated automatically.</p><button className="sol-outline-button" type="button" disabled={refreshing || state.busy} onClick={() => void refresh()}>{refreshing ? 'Checking saved records…' : 'Refresh saved records'}</button><Link target="_blank" rel="noopener noreferrer" href={state.artifactId ? realMemoryHref(nookId,state.artifactId) : `/circles/${nookId}`}>Inspect memory in a new tab</Link>{memories.map(a => <button key={a.id} className="sol-outline-button" type="button" disabled={refreshing} onClick={() => void recover(a.id,'artifact')}>Resume {a.title} · #{a.id} · {new Date(a.createdAt).toLocaleString()}</button>)}{drafts.map(c => <button key={c.id} className="sol-outline-button" type="button" disabled={refreshing} onClick={() => void recover(c.id,'contribution')}>Resume voice #{c.id} · {new Date(c.createdAt).toLocaleString()}</button>)}</details>}
    {state.saved && mode === 'memory' && <div className="real-memory-actions"><Link className="sol-button" href={realMemoryHref(nookId,state.artifactId!)}>View Memory</Link><Link className="sol-outline-button" href={`/circles/${nookId}`}>Back to Nook</Link><p className="real-memory-help">You can finish now, even if transcription or translation isn’t complete.</p></div>}
    {onClose && <button type="button" className="sol-text-link" disabled={state.busy} onClick={() => { if (recorder.status === 'recording') recorder.stopRecording(); if (recorder.status === 'requesting') recorder.discardRecording(); onClose(); }}>{recorder.audioBlob || capturing ? 'Close & keep draft' : 'Cancel'}</button>}
  </section>;
}
