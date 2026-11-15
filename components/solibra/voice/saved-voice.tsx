'use client';
import { useEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import type { Contribution, ContributionResponse, ContributionListResponse } from '@/lib/memories/types';
import type { SavedTranslation, SavedTranslationListResponse } from '@/lib/voice/persistence-types';
import { TARGET_LANGUAGES, languageLabel } from '@/lib/voice/languages';
import { contributionPath, processSavedVoice, VoiceProcessingError } from '@/lib/frontend/persisted-voice-client';
import { artifactPath } from '@/lib/frontend/real-memories';
import { NookRequestError } from '@/lib/frontend/nook-api';
import { useNookData } from '../use-nook-data';
import { useConfirmedWrite } from '../use-confirmed-write';
import { NookRequestState } from '../nook-request-state';
import { PrivateRecording } from '../private-recording';

export function canManageVoice(viewerId: number, authorId: number, nookRole: string) { return viewerId === authorId || nookRole === 'owner'; }
export function voiceReadDenied(error: unknown) { return error instanceof NookRequestError && [401,403,404].includes(error.status); }

export function SavedVoice({ contribution, nookId, artifactId, viewerId, authorName, canManage, initialLanguage = 'en', initiallyExpanded = false, confirmedMedia = false, guided = false, onProcessed }: {
  contribution: Contribution; nookId: number; artifactId: number; viewerId: number; authorName: string; canManage: boolean;
  initialLanguage?: string; initiallyExpanded?: boolean; confirmedMedia?: boolean; guided?: boolean; onProcessed?: () => void;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [language, setLanguage] = useState(initialLanguage);
  const [target, setTarget] = useState(initialLanguage);
  const [requestOpen, setRequestOpen] = useState(guided);
  const [notice, setNotice] = useState('');
  const [refreshRequired, setRefreshRequired] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const path = contributionPath(nookId, artifactId, contribution.id);
  const detail = useNookData<ContributionResponse>(expanded ? path : null, viewerId);
  const translations = useNookData<SavedTranslationListResponse>(expanded ? `${path}/translations` : null, viewerId);
  const write = useConfirmedWrite();
  const { mutate } = useSWRConfig();
  const readError = [detail.error,translations.error].find(voiceReadDenied);
  const current = expanded && detail.data ? detail.data.contribution : contribution;
  const valid = current.id === contribution.id && current.artifactId === artifactId && current.type === 'audio';
  const saved = translations.data?.translations?.filter(item => item.contributionId === current.id && item.sourceLanguage === current.sourceLanguage) || [];
  const selected = saved.find(item => item.targetLanguage === language) || saved[0];
  const requested = saved.find(item => item.targetLanguage === target);
  // A finalized upload is usable even if its follow-up metadata read is offline.
  const attached = !!current.audioStorageKey || confirmedMedia && current.updatedAt === contribution.updatedAt;
  const allowed = canManage && !permissionDenied;
  const leaseActive = current.processingStatus === 'processing' && Date.now() - Date.parse(current.updatedAt) < 180_000;
  useEffect(() => {
    if (readError) void mutate([`/api/nooks/${nookId}`,viewerId]).catch(() => {});
  }, [readError, mutate, nookId, viewerId]);
  if (readError) return <NookRequestState error={readError} retry={() => void refresh()}/>;
  if (!valid) return <p role="alert">This voice could not be verified.</p>;
  async function update(c: Contribution, translation?: SavedTranslation) {
    if (!mounted.current) return;
    await detail.mutate({ contribution: c }, { revalidate: false });
    if (translation) await translations.mutate(value => ({ translations: [...(value?.translations || []).filter(item => item.id !== translation.id && item.targetLanguage !== translation.targetLanguage), translation] }), { revalidate: false });
    await mutate([`${artifactPath(nookId, artifactId)}/contributions`, viewerId], (value: ContributionListResponse | undefined) => ({ contributions: [...(value?.contributions || []).filter(item => item.id !== c.id), c] }), { revalidate: false });
  }
  async function refresh() {
    try {
      const next = await detail.mutate();
      void translations.mutate().catch(() => {});
      if (!mounted.current) return;
      const c = next?.contribution;
      if (!c || detail.error && !detail.data) return;
      const leased = c.processingStatus === 'processing' && Date.now() - Date.parse(c.updatedAt) < 180_000;
      setRefreshRequired(leased);
      setNotice(leased ? 'Still processing. Refresh again after the three-minute processing window.' : 'Saved voice refreshed.');
    } catch { if (mounted.current) setNotice('Couldn’t refresh. Your saved audio remains available; try Refresh again.'); }
  }
  async function process() {
    if (refreshRequired || leaseActive || !allowed) return;
    setNotice('');
    await write.run(async () => {
      try { return await processSavedVoice(nookId, artifactId, current.id, target, !!current.originalTranscript); }
      catch (cause) {
        if (mounted.current) {
          if (cause instanceof VoiceProcessingError && cause.contribution) await update(cause.contribution);
          else await detail.mutate().catch(() => {});
          if (cause instanceof VoiceProcessingError) {
            if (cause.uncertain || cause.status === 409) setRefreshRequired(true);
            if (cause.status === 403) { setPermissionDenied(true); void mutate([`/api/nooks/${nookId}`,viewerId]).catch(() => {}); }
            if (cause.status === 401 || cause.status === 404) void detail.mutate().catch(() => {});
          }
        }
        throw cause;
      }
    }, async result => {
      await update(result.contribution, result.translation);
      if (!mounted.current) return;
      setLanguage(result.translation.targetLanguage); setRequestOpen(false);
      setNotice(result.cached ? 'Saved translation loaded.' : 'Translation saved.'); onProcessed?.();
    });
  }
  const availability = write.pending ? current.originalTranscript ? 'Translating…' : 'Transcribing…' : current.processingStatus === 'processing' ? 'Transcribing…' : current.originalTranscript ? 'Transcript ready' : attached ? 'Recording saved' : 'Recording not attached yet';
  return <article id={`voice-${current.id}`} className="real-perspective saved-voice"><h3>{authorName}</h3><time dateTime={current.createdAt}>{new Date(current.createdAt).toLocaleString()}</time>
    {attached ? <PrivateRecording src={`${path}/media?v=${encodeURIComponent(current.updatedAt)}`} label={`Original voice by ${authorName}`}/> : <p>Recording unavailable. Attach a recording to this saved voice draft.</p>}
    <p className="voice-availability" role="status">{availability}</p>
    <button className="sol-outline-button" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Hide transcript & translations' : 'View transcript & translations'}</button>
    {expanded && <div className="saved-voice-results">
      {detail.error && <p role="status">Couldn’t refresh this voice. Showing the last authorized saved version.</p>}
      <section><h4>Original transcript{current.sourceLanguage ? ` · ${languageLabel(current.sourceLanguage)}` : ''}</h4><p className="real-transcript">{current.originalTranscript || 'No transcript yet.'}</p></section>
      <section><h4>Translations</h4>{translations.error ? <p role="alert">Couldn’t load saved translations. Your recording and original transcript are still available. <button className="sol-text-link" type="button" onClick={() => void translations.mutate().catch(() => {})}>Retry loading translations</button></p> : !translations.data ? <p role="status">Loading saved translations…</p> : !saved.length ? <p>Translation unavailable. No translation has been saved yet.</p> : null}
        {!!saved.length && !requestOpen && <label>Saved translation<select value={selected?.targetLanguage || ''} onChange={event => setLanguage(event.target.value)}>{saved.map(item => <option key={item.id} value={item.targetLanguage}>{languageLabel(item.targetLanguage)}</option>)}</select></label>}
        {selected && <><h5>{languageLabel(selected.targetLanguage)}</h5><p className="real-transcript">{selected.translatedText}</p></>}
      </section>
      {allowed && attached && !requestOpen && <button className="sol-outline-button" type="button" onClick={() => { setRequestOpen(true); setTarget(initialLanguage); }}>{current.originalTranscript ? 'Translate to another language' : 'Transcribe & Translate'}</button>}
      {allowed && attached && requestOpen && <section className="voice-language-request"><label>Translate to<select value={target} disabled={write.pending} onChange={event => setTarget(event.target.value)}>{TARGET_LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><p className="real-memory-help">The spoken language is detected automatically.</p><div className="real-memory-actions">{requested ? <button type="button" className="sol-button" onClick={() => { setLanguage(target); setRequestOpen(false); }}>View saved translation</button> : <button className="sol-button" type="button" disabled={write.pending || refreshRequired || leaseActive} onClick={() => void process()}>{write.pending ? current.originalTranscript ? 'Translating…' : 'Transcribing…' : current.originalTranscript ? write.error ? 'Retry translation' : 'Translate' : write.error ? 'Retry transcription' : 'Transcribe & Translate'}</button>}<button className="sol-text-link" type="button" disabled={write.pending} onClick={() => setRequestOpen(false)}>Cancel</button></div></section>}
      {leaseActive && <p role="status">This recording is still processing. Refresh shortly; an interrupted job can take up to three minutes to clear.</p>}
      {permissionDenied && <p role="alert">You can still listen and read. Permission to generate this translation was denied; only the author or a current Nook owner can do that.</p>}
      {write.error && <p role="alert">{write.error.message}{current.originalTranscript && ' Your original transcript is safe.'}</p>}
      {notice && <p role="status">{notice}</p>}
      {(write.error || detail.error || current.processingStatus === 'processing') && <button className="sol-outline-button" type="button" disabled={write.pending} onClick={() => void refresh()}>Refresh saved voice</button>}
    </div>}
  </article>;
}
