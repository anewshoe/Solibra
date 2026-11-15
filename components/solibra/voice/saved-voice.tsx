'use client';
import { useEffect, useRef, useState } from 'react';
import { useSWRConfig } from 'swr';
import type { Contribution, ContributionResponse, ContributionListResponse } from '@/lib/memories/types';
import type { SavedTranslation, SavedTranslationListResponse } from '@/lib/voice/persistence-types';
import { TARGET_LANGUAGES, languageLabel } from '@/lib/voice/languages';
import { contributionPath, processSavedVoice, VoiceProcessingError } from '@/lib/frontend/persisted-voice-client';
import { artifactPath } from '@/lib/frontend/real-memories';
import { useNookData } from '../use-nook-data';
import { useConfirmedWrite } from '../use-confirmed-write';
import { NookRequestState } from '../nook-request-state';
import { PrivateRecording } from '../private-recording';

export function canManageVoice(viewerId: number, authorId: number, nookRole: string) { return viewerId === authorId || nookRole === 'owner'; }

export function SavedVoice({ contribution, nookId, artifactId, viewerId, authorName, canManage, initialLanguage = 'en', initiallyExpanded = false }: {
  contribution: Contribution; nookId: number; artifactId: number; viewerId: number; authorName: string; canManage: boolean; initialLanguage?: string; initiallyExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const [language, setLanguage] = useState(initialLanguage);
  const [notice, setNotice] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const path = contributionPath(nookId, artifactId, contribution.id);
  const detail = useNookData<ContributionResponse>(expanded ? path : null, viewerId);
  const translations = useNookData<SavedTranslationListResponse>(expanded ? `${path}/translations` : null, viewerId);
  const write = useConfirmedWrite();
  const { mutate } = useSWRConfig();
  const error = detail.error || translations.error || write.accessError;
  if (error) return <NookRequestState error={error} retry={() => { write.clearError(); void Promise.all([detail.mutate(), translations.mutate()]).catch(() => {}); }}/>;
  const current = expanded && detail.data ? detail.data.contribution : contribution;
  if (current.id !== contribution.id || current.artifactId !== artifactId || current.type !== 'audio') return <p role="alert">This voice could not be verified.</p>;
  const saved = translations.data?.translations.filter(item => item.contributionId === current.id && item.sourceLanguage === current.sourceLanguage) || [];
  const selected = saved.find(item => item.targetLanguage === language);
  async function update(c: Contribution, translation?: SavedTranslation) {
    if (!mounted.current) return;
    await detail.mutate({ contribution: c }, { revalidate: false });
    if (translation) await translations.mutate(value => ({ translations: [...(value?.translations || []).filter(item => item.id !== translation.id && item.targetLanguage !== translation.targetLanguage), translation] }), { revalidate: false });
    await mutate([`${artifactPath(nookId, artifactId)}/contributions`, viewerId], (value: ContributionListResponse | undefined) => ({ contributions: [...(value?.contributions || []).filter(item => item.id !== c.id), c] }), { revalidate: false });
  }
  async function process() {
    setNotice('');
    await write.run(async () => {
      try { return await processSavedVoice(nookId, artifactId, current.id, language, !!current.originalTranscript); }
      catch (cause) {
        if (cause instanceof VoiceProcessingError && cause.contribution) await update(cause.contribution);
        else if (mounted.current) await detail.mutate().catch(() => {});
        throw cause;
      }
    }, async result => {
      await update(result.contribution, result.translation);
      setNotice(result.cached ? 'Saved transcript and translation loaded.' : 'Transcript and translation saved.');
      await Promise.all([detail.mutate(), translations.mutate()]).catch(() => {});
    });
  }
  return <article className="real-perspective saved-voice"><h3>{authorName}</h3><time dateTime={current.createdAt}>{new Date(current.createdAt).toLocaleString()}</time>
    {current.audioStorageKey ? <PrivateRecording src={`${path}/media?v=${encodeURIComponent(current.updatedAt)}`} label={`Original voice by ${authorName}`}/> : <p>Recording unavailable · {current.processingStatus || 'Draft'}</p>}
    <p>Processing: {current.processingStatus || 'Not started'}</p><h4>Original transcript{current.sourceLanguage ? ` · ${languageLabel(current.sourceLanguage)}` : ''}</h4><p className="real-transcript">{current.originalTranscript || 'An original transcript is not available yet.'}</p>
    <button className="sol-outline-button" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>Transcript & translations</button>
    {expanded && <div className="saved-voice-results">
      {!translations.data && <p role="status">Loading saved translations…</p>}
      {!!saved.length && <label>Saved translation<select value={selected?.targetLanguage || ''} onChange={event => setLanguage(event.target.value)}><option value="" disabled>Choose a saved language</option>{saved.map(item => <option key={item.id} value={item.targetLanguage}>{languageLabel(item.targetLanguage)}</option>)}</select></label>}
      {selected && <section><h4>{languageLabel(selected.targetLanguage)} translation</h4><p className="real-transcript">{selected.translatedText}</p></section>}
      {!saved.length && translations.data && <p>No translations have been saved yet.</p>}
      {canManage && current.audioStorageKey && <><label>Target translation language<select value={language} disabled={write.pending} onChange={event => { setLanguage(event.target.value); setNotice(''); }}>{TARGET_LANGUAGES.map(item => <option key={item.code} value={item.code}>{item.label}</option>)}</select></label><p className="real-memory-help">Your spoken language is detected automatically. A completed transcript does not mean every translation is saved.</p><button className="sol-button" type="button" disabled={write.pending || !!selected} onClick={() => void process()}>{write.pending ? 'Processing saved recording…' : selected ? 'Translation saved' : current.originalTranscript ? write.error ? 'Retry translation' : 'Translate saved transcript' : 'Transcribe & Translate'}</button></>}
      {!canManage && <p className="real-memory-help">You can read saved translations. Only this voice’s author or a Nook owner can request another language.</p>}
      {current.processingStatus === 'processing' && <p role="status">Processing may still be underway. Refresh first; an interrupted job can be retried after its three-minute lease.</p>}
      {write.error && <p role="alert">{write.error.message}</p>}{notice && <p role="status">{notice}</p>}
      <button className="sol-text-link" type="button" disabled={write.pending} onClick={() => void Promise.all([detail.mutate(), translations.mutate()]).catch(() => {})}>Refresh saved voice and translations</button>
    </div>}
  </article>;
}
