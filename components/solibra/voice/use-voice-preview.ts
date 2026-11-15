'use client';

import { useEffect, useRef, useState } from 'react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { requestVoicePreview, VoiceRequestError } from '@/lib/frontend/voice-client';
import type { VoiceProcessResult, VoiceTranscript } from '@/lib/voice/types';

// Presentation state only. Recording, detection, limits, and translation stay
// in the existing hook and authenticated APIs.
export function useVoicePreview() {
  const recorder = useAudioRecorder();
  const [targetLanguage, setTargetLanguageState] = useState('en');
  const [transcript, setTranscript] = useState<VoiceTranscript | null>(null);
  const [result, setResult] = useState<VoiceProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => { requestRef.current?.abort(); requestRef.current = null; }, []);

  function cancelProcessing() {
    requestRef.current?.abort(); requestRef.current = null;
    setSubmitting(false);
  }
  function clearResults() {
    cancelProcessing(); setTranscript(null); setResult(null); setError(null); setNeedsSignIn(false);
  }
  function start() {
    clearResults(); setDraftId(`preview-contribution:${crypto.randomUUID()}`);
    void recorder.startRecording();
  }
  function discard() {
    clearResults(); recorder.discardRecording(); setDraftId(null);
  }
  function setTargetLanguage(language: string) {
    setTargetLanguageState(language); setResult(null); setError(null); setNeedsSignIn(false);
  }
  async function process() {
    if (requestRef.current || recorder.status !== 'stopped' || !recorder.audioBlob) return;
    const controller = new AbortController(); requestRef.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), transcript ? 60_000 : 120_000);
    setSubmitting(true); setError(null); setNeedsSignIn(false);
    try {
      const next = await requestVoicePreview({ targetLanguage, signal: controller.signal, transcript: transcript || undefined, audio: recorder.audioBlob, mimeType: recorder.mimeType || undefined });
      if (requestRef.current !== controller) return;
      setTranscript({ transcript: next.transcript, originalLanguage: next.originalLanguage }); setResult(next);
    } catch (cause) {
      if (requestRef.current !== controller) return;
      if (cause instanceof VoiceRequestError) {
        if (cause.partial) setTranscript({ transcript: cause.partial.transcript, originalLanguage: cause.partial.originalLanguage });
        setNeedsSignIn(cause.status === 401);
      }
      setError(controller.signal.aborted ? 'The request timed out. Your recording and any completed transcript are still available.' : cause instanceof Error ? cause.message : 'Processing did not finish. Check your connection and try again.');
    } finally {
      window.clearTimeout(timeout);
      if (requestRef.current === controller) { requestRef.current = null; setSubmitting(false); }
    }
  }
  return { recorder, targetLanguage, setTargetLanguage, transcript, result, error, needsSignIn, submitting, draftId, start, discard, process, cancelProcessing };
}

export const formatDuration = (ms: number) => `${Math.floor(ms / 60_000)}:${Math.floor(ms / 1000 % 60).toString().padStart(2, '0')}`;
