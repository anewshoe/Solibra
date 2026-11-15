'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import { Mic, Square } from 'lucide-react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import type { Artifact, ContributionListResponse, ContributionResponse } from '@/lib/memories/types';
import { TARGET_LANGUAGES } from '@/lib/voice/languages';
import { contributionPath, VoiceSaveFlow } from '@/lib/frontend/persisted-voice-client';
import { artifactPath, realMemoryHref } from '@/lib/frontend/real-memories';
import { nookRequest, NookRequestError } from '@/lib/frontend/nook-api';
import { useConfirmedWrite } from '../use-confirmed-write';
import { PrivateRecording } from '../private-recording';
import { SolibraEmote } from '../solibra-emote';
import { SavedVoice } from './saved-voice';
import { formatDuration } from './use-voice-preview';

export function RealRecorder({ nookId, viewerId, artifactId, contributionId, createArtifact, onDraftChange }: {
  nookId: number; viewerId: number; artifactId?: number; contributionId?: number; createArtifact?: () => Promise<Artifact>; onDraftChange?: (hasDraft: boolean, pending: boolean) => void;
}) {
  const recorder = useAudioRecorder();
  const flow = useRef(new VoiceSaveFlow(nookId, viewerId, artifactId, contributionId)).current;
  const [language, setLanguage] = useState('en');
  const [stage, setStage] = useState('');
  const [savedVoice, setSavedVoice] = useState<ContributionResponse | null>(null);
  const [drafts, setDrafts] = useState<ContributionListResponse | null>(null);
  const [refreshError, setRefreshError] = useState('');
  const mounted = useRef(true);
  const write = useConfirmedWrite();
  const { mutate } = useSWRConfig();
  const active = ['requesting','recording','stopping'].includes(recorder.status);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onDraftChange?.(active || !!recorder.audioBlob || !!flow.artifactId, write.pending); }, [active, recorder.audioBlob, flow.artifactId, write.pending, onDraftChange]);
  async function refresh() {
    setRefreshError('');
    if (!flow.artifactId) { setRefreshError('Open your Nook to inspect whether the memory was created. No automatic create retry will run.'); return; }
    try {
      const path = artifactPath(nookId, flow.artifactId);
      const list = await nookRequest<ContributionListResponse>(`${path}/contributions`);
      if (!mounted.current) return;
      setDrafts({ contributions: list.contributions.filter(c => c.artifactId === flow.artifactId && c.type === 'audio' && c.authorId === viewerId && !c.audioStorageKey) });
      const found = list.contributions.find(c => c.id === flow.contributionId && c.artifactId === flow.artifactId && c.type === 'audio');
      if (found?.audioStorageKey) { flow.saved = true; setSavedVoice({ contribution: found }); setStage('Recording saved. You can now transcribe and translate it.'); }
      await mutate([`${path}/contributions`, viewerId]);
    } catch (cause) {
      if (cause instanceof NookRequestError && [401,403,404].includes(cause.status)) setSavedVoice(null);
      setRefreshError(cause instanceof Error ? cause.message : 'Unable to refresh this voice.');
    }
  }
  async function save() {
    if (!recorder.audioBlob) return;
    await write.run(() => flow.save(recorder.audioBlob!, createArtifact, message => { if (mounted.current) setStage(message); }, () => mounted.current), async () => {
      if (!flow.saved || !flow.artifactId || !flow.contributionId) return;
      // Upload acknowledgment is already confirmed, even if this subsequent read fails.
      await refresh();
      await Promise.all([mutate([artifactPath(nookId), viewerId]), mutate([artifactPath(nookId, flow.artifactId), viewerId])]).catch(() => {});
    });
  }
  const frozen = write.pending || flow.saved || !!flow.uncertainStage || !!recorder.audioBlob && (!!flow.contributionId || !!flow.artifactId && !artifactId);
  return <section className="real-memory-form real-recorder" aria-label="Record a saved voice">
    <h3>Tell it in your own words.</h3><p>Any language. Your voice will be private to this Nook once saved.</p>
    <div className="voice-recording-status" data-recording={recorder.status === 'recording'}>{recorder.status === 'recording' && <span className="recording-dot" aria-hidden="true"/>}<output aria-label="Recording duration">{formatDuration(recorder.elapsedMs)}</output><span>3 minutes / 4 MiB maximum</span></div>
    {!flow.saved && <div className="real-memory-actions">{recorder.status === 'recording' ? <button className="sol-button" type="button" onClick={recorder.stopRecording}><Square size={16}/>Stop recording</button> : <button className="sol-button" type="button" disabled={active || frozen} onClick={() => void recorder.startRecording()}><Mic size={16}/>{recorder.status === 'requesting' ? 'Waiting for microphone…' : recorder.status === 'stopping' ? 'Finishing recording…' : recorder.audioBlob ? 'Record again' : 'Record voice'}</button>}{recorder.audioBlob && !frozen && <button className="sol-outline-button" type="button" onClick={recorder.discardRecording}>Discard recording</button>}</div>}
    {recorder.audioUrl && <PrivateRecording src={recorder.audioUrl} label="Your local original recording"/>}
    {recorder.error && <p role="alert">{recorder.error}</p>}{recorder.notice && <p role="status">{recorder.notice}</p>}
    {!flow.saved && <><label>Target translation language<select value={language} disabled={write.pending} onChange={event => setLanguage(event.target.value)}>{TARGET_LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><p className="real-memory-help">The spoken language is detected automatically. Save first, then choose Transcribe & Translate. Keep this page open to retain an unsaved recording.</p><button className="sol-button" type="button" disabled={active || write.pending || !recorder.audioBlob || !!flow.uncertainStage} onClick={() => void save()}>{write.pending ? 'Saving recording…' : flow.contributionId ? 'Retry attaching recording' : flow.artifactId ? 'Continue saving recording' : 'Save recording'}</button></>}
    {stage && <p role="status">{stage}</p>}{flow.saved && <div className="memory-save-feedback"><SolibraEmote variant="celebrate" size={64}/><p>Recording saved. Transcription and translation may still need to be completed.</p></div>}
    {write.error && <p role="alert">{write.error.message} Confirmed memory and contribution IDs are kept; your local recording remains available.</p>}
    {(flow.artifactId || flow.uncertainStage) && <div className="real-memory-actions"><button className="sol-outline-button" type="button" disabled={write.pending} onClick={() => void refresh()}>Refresh saved voice before retrying</button><Link className="sol-outline-button" target="_blank" rel="noopener noreferrer" aria-label="Inspect saved memory in a new tab; keep this recording draft open" href={flow.artifactId ? realMemoryHref(nookId, flow.artifactId) : `/circles/${nookId}`}>Inspect saved memory →</Link></div>}
    {refreshError && <p role="alert">{refreshError}</p>}
    {flow.uncertainStage === 'contribution' && drafts && <div><p>Choose a confirmed empty voice draft to continue attaching this recording. Creating another contribution is blocked while the previous result is unknown.</p>{drafts.contributions.map(c => <button type="button" className="sol-outline-button" key={c.id} onClick={() => { flow.contributionId = c.id; flow.uncertainStage = null; setStage(`Using confirmed voice draft #${c.id}. Retry attaching your recording.`); }}>Use draft #{c.id} · {new Date(c.createdAt).toLocaleString()}</button>)}</div>}
    {flow.saved && savedVoice && <SavedVoice key={`${viewerId}:${savedVoice.contribution.id}`} contribution={savedVoice.contribution} nookId={nookId} artifactId={flow.artifactId!} viewerId={viewerId} authorName="Your saved voice" canManage initialLanguage={language} initiallyExpanded/>}
  </section>;
}
