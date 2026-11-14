'use client';

import { useEffect, useRef, useState } from 'react';

import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { TARGET_LANGUAGES } from '@/lib/voice/languages';
import { filenameForAudio } from '@/lib/voice/audio';
import type { VoiceProcessResult } from '@/lib/voice/types';

function formatElapsed(elapsedMs: number): string {
  const totalSeconds = Math.floor(elapsedMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export default function VoiceDevPage() {
  const recorder = useAudioRecorder();
  const [targetLanguage, setTargetLanguage] = useState('en');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<VoiceProcessResult | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  function clearResults() {
    requestRef.current?.abort();
    requestRef.current = null;
    setSubmitting(false);
    setSubmitError(null);
    setResult(null);
  }

  function discard() {
    clearResults();
    recorder.discardRecording();
  }

  function recordAgain() {
    clearResults();
    void recorder.startRecording();
  }

  const canSubmit = recorder.audioBlob !== null && !submitting && recorder.status === 'stopped';

  async function submitRecording() {
    if (!canSubmit || !recorder.audioBlob || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 120_000);
    setSubmitting(true);
    setSubmitError(null);
    setResult(null);

    const body = new FormData();
    body.append(
      'audio',
      recorder.audioBlob,
      filenameForAudio(recorder.mimeType ?? '')
    );
    body.append('targetLanguage', targetLanguage);

    try {
      const response = await fetch('/api/voice/process', {
        method: 'POST',
        body,
        signal: controller.signal,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (requestRef.current !== controller) return;
      if (!response.ok) {
        setSubmitError(
          payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
            ? payload.error
            : response.status === 413
              ? 'The server rejected the upload size. Try a shorter recording.'
              : `Processing failed (HTTP ${response.status}). Try again.`
        );
        return;
      }
      if (!isVoiceResult(payload)) {
        setSubmitError('The server returned an incomplete result. Try again.');
        return;
      }
      setResult(payload);
    } catch {
      if (requestRef.current !== controller) return;
      setSubmitError(controller.signal.aborted
        ? 'Processing timed out. Your recording is still available; try a shorter clip.'
        : 'The request did not finish. Check your connection and try again.');
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) {
        requestRef.current = null;
        setSubmitting(false);
      }
    }
  }

  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col gap-6 px-4 py-10 text-gray-900">
      <header className="space-y-2">
        <p className="text-sm font-medium text-orange-700">Temporary test page</p>
        <h1 className="text-3xl font-semibold tracking-tight">Voice memory pipeline</h1>
        <p className="text-sm leading-6 text-gray-600">
          Record a short memory, play it back, then transcribe it with ElevenLabs
          and translate it with Gemini. Sign in first, unless this local dev
          server has the development-only auth bypass enabled.
        </p>
      </header>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-gray-500">Recording</p>
            <p className="font-mono text-2xl tabular-nums">
              {formatElapsed(recorder.elapsedMs)}
            </p>
          </div>
          <p className="text-sm text-gray-500">3 minute limit</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {recorder.status === 'recording' ? (
            <button
              type="button"
              onClick={recorder.stopRecording}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={recordAgain}
              disabled={recorder.status === 'requesting' || recorder.status === 'stopping' || submitting}
              className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {recorder.status === 'requesting' ? 'Waiting for microphone…'
                : recorder.status === 'stopping' ? 'Finishing recording…'
                  : recorder.audioBlob ? 'Record again' : 'Record'}
            </button>
          )}
          <button
            type="button"
            onClick={discard}
            disabled={!recorder.audioBlob && recorder.status === 'idle'}
            className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-400"
          >
            {submitting ? 'Cancel and discard' : 'Discard'}
          </button>
        </div>

        {recorder.audioUrl ? (
          <audio aria-label="Original recording playback" className="w-full" controls src={recorder.audioUrl} />
        ) : (
          <p className="text-sm text-gray-500">
            {recorder.status === 'recording'
              ? 'Recording… speak, then stop to play it back.'
              : 'No recording yet.'}
          </p>
        )}

        {recorder.notice ? (
          <p className="text-sm text-amber-700">{recorder.notice}</p>
        ) : null}
        {recorder.error ? (
          <p className="text-sm text-red-700" role="alert">
            {recorder.error}
          </p>
        ) : null}
      </section>

      <section className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <label className="block space-y-2 text-sm font-medium text-gray-800">
          Translation language
          <select
            value={targetLanguage}
            disabled={submitting}
            onChange={(event) => {
              clearResults();
              setTargetLanguage(event.target.value);
            }}
            className="block w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {TARGET_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => void submitRecording()}
          disabled={!canSubmit}
          className="rounded-full bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-orange-300"
        >
          {submitting ? 'Transcribing and translating…' : 'Submit recording'}
        </button>

        {submitting ? <p role="status" className="text-sm text-gray-600">Processing may take up to two minutes. Playback remains available.</p> : null}
        {submitError ? (
          <p className="text-sm text-red-700" role="alert">
            {submitError}
          </p>
        ) : null}
      </section>

      {result ? (
        <section className="space-y-4">
          <article className="space-y-2 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-gray-500">
              Original transcript ({result.originalLanguage || 'unknown'})
            </h2>
            <p className="whitespace-pre-wrap leading-7">{result.transcript}</p>
          </article>
          <article className="space-y-2 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-medium text-gray-500">
              Translation ({result.targetLanguage})
            </h2>
            <p className="whitespace-pre-wrap leading-7">{result.translation}</p>
          </article>
        </section>
      ) : null}
    </main>
  );
}

function isVoiceResult(value: unknown): value is VoiceProcessResult {
  return value !== null && typeof value === 'object' &&
    ['transcript', 'originalLanguage', 'translation', 'targetLanguage']
      .every((key) => key in value && typeof (value as Record<string, unknown>)[key] === 'string');
}
