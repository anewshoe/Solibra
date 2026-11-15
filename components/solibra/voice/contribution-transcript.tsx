'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { TARGET_LANGUAGES, languageLabel, languagesMatch } from '@/lib/voice/languages';
import { requestVoicePreview, VoiceRequestError } from '@/lib/frontend/voice-client';
import type { Contribution } from '@/lib/fixtures/conversations';
import { useDemo } from '../demo-provider';

export function ContributionTranscript({ contribution }: { contribution: Contribution }) {
  const { updateTranslation } = useDemo();
  const [target, setTarget] = useState(Object.keys(contribution.translations)[0] || 'en');
  const [view, setView] = useState<'original' | 'translation'>('original');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); request.current = null; }, []);
  const translation = languagesMatch(target, contribution.originalLanguage) ? contribution.transcript : contribution.translations[target];
  async function translate() {
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 60_000);
    setBusy(true); setError(null); setNeedsSignIn(false);
    try {
      const result = await requestVoicePreview({ transcript: { transcript: contribution.transcript, originalLanguage: contribution.originalLanguage }, targetLanguage: target, signal: controller.signal });
      if (request.current !== controller) return;
      updateTranslation(contribution.contributionId, result.targetLanguage, result.translation); setView('translation');
    } catch (cause) {
      if (request.current !== controller) return;
      setNeedsSignIn(cause instanceof VoiceRequestError && cause.status === 401);
      setError(controller.signal.aborted ? 'Translation timed out. The original transcript is still available.' : cause instanceof Error ? cause.message : 'Translation did not finish. Try again.');
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setBusy(false); }
    }
  }
  return <section className="contribution-transcript" aria-label="Original transcript and translation">
    <div className="transcript-tabs" role="group" aria-label="Transcript view">
      <button aria-pressed={view === 'original'} onClick={() => setView('original')}>Original · {contribution.originalLanguage.toUpperCase()}</button>
      <button aria-pressed={view === 'translation'} onClick={() => setView('translation')}>{languageLabel(target)}</button>
    </div>
    <div className="transcript-original" data-active={view === 'original'}><h3>Original transcript <span>· {languageLabel(contribution.originalLanguage)}</span></h3><p lang={contribution.originalLanguage}>{contribution.transcript}</p></div>
    <label className="sol-language-select">Translate to<select value={target} disabled={busy} onChange={(event) => { setTarget(event.target.value); setError(null); setNeedsSignIn(false); setView('translation'); }}>{TARGET_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}</select></label>
    <div className="transcript-translation" data-active={view === 'translation'}>
      <h4>{languageLabel(target)} translation</h4>
      {translation ? <p lang={target}>{translation}</p> : <><p>{contribution.provenance === 'fixture' ? 'This sample has no translation in this language yet.' : 'Translation is not complete. Your original transcript is preserved.'}</p><button className="sol-outline-button" disabled={busy} onClick={() => void translate()}>{busy ? 'Translating…' : error ? 'Retry translation' : 'Translate transcript'}</button></>}
    </div>
    {busy && <p role="status">Translating the transcript. The audio is not uploaded again.</p>}
    {error && <p className="voice-error" role="alert">{error}</p>}
    {needsSignIn && <Link className="sol-text-link" href="/sign-in" target="_blank" rel="noopener noreferrer">Sign in in a new tab, then retry here</Link>}
    <p className="voice-help">{contribution.provenance === 'temporary' ? 'Original audio stays in this temporary preview.' : 'Original language preserved. Sample audio unavailable.'}</p>
  </section>;
}
