'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ACCEPTED_AUDIO_TYPES, baseContentType, MAX_AUDIO_BYTES, MAX_RECORDING_DURATION_MS } from '@/lib/voice/audio';
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const;

export type AudioRecorderStatus =
  | 'idle'
  | 'requesting'
  | 'recording'
  | 'stopping'
  | 'stopped';

type UseAudioRecorderOptions = {
  maxDurationMs?: number;
};

function preferredMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

function messageForMediaError(error: unknown): string {
  if (error instanceof DOMException) {
    if (
      error.name === 'NotAllowedError' ||
      error.name === 'PermissionDeniedError'
    ) {
      return 'Microphone access was denied. Allow the microphone for this site and try again.';
    }
    if (
      error.name === 'NotFoundError' ||
      error.name === 'DevicesNotFoundError'
    ) {
      return 'No microphone was found. Connect one and try again.';
    }
    if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
      return 'The microphone is busy in another app. Close it and try again.';
    }
    if (error.name === 'SecurityError') {
      return 'Recording needs a secure page. Open the app on localhost or HTTPS.';
    }
  }
  if (typeof MediaRecorder === 'undefined') {
    return 'This browser cannot record audio. Try Chrome, Edge, or Firefox.';
  }
  return 'Could not start recording. Check the microphone and try again.';
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function useAudioRecorder(options: UseAudioRecorderOptions = {}) {
  const requestedDuration = options.maxDurationMs ?? MAX_RECORDING_DURATION_MS;
  const maxDurationMs = Number.isFinite(requestedDuration) && requestedDuration > 0
    ? Math.min(requestedDuration, MAX_RECORDING_DURATION_MS)
    : MAX_RECORDING_DURATION_MS;
  const [status, setStatus] = useState<AudioRecorderStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const urlRef = useRef<string | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const timerRef = useRef<number | null>(null);
  const limitTimerRef = useRef<number | null>(null);
  const bytesRef = useRef(0);
  const generationRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (limitTimerRef.current !== null) {
      window.clearTimeout(limitTimerRef.current);
      limitTimerRef.current = null;
    }
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const revokeUrl = useCallback(() => {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
  }, []);

  const releaseMicrophone = useCallback(() => {
    clearTimer();
    startedAtRef.current = null;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder) {
      recorder.ondataavailable = null;
      recorder.onstop = null;
      recorder.onerror = null;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    stopStream(streamRef.current);
    streamRef.current = null;
  }, [clearTimer]);

  const discardRecording = useCallback(() => {
    generationRef.current += 1;
    releaseMicrophone();
    chunksRef.current = [];
    revokeUrl();
    setAudioBlob(null);
    setAudioUrl(null);
    setMimeType(null);
    setElapsedMs(0);
    setError(null);
    setNotice(null);
    setStatus('idle');
  }, [releaseMicrophone, revokeUrl]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;
    clearTimer();
    if (startedAtRef.current !== null) {
      setElapsedMs(Math.min(Date.now() - startedAtRef.current, maxDurationMs));
    }
    setStatus('stopping');
    recorder.stop();
    stopStream(streamRef.current);
  }, [clearTimer, maxDurationMs]);

  const startRecording = useCallback(async () => {
    if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
      setError('This browser cannot record audio. Try Chrome, Edge, or Firefox.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Microphone access requires localhost or HTTPS and a supported browser.');
      return;
    }

    generationRef.current += 1;
    const generation = generationRef.current;
    releaseMicrophone();
    chunksRef.current = [];
    revokeUrl();
    setAudioBlob(null);
    setAudioUrl(null);
    setMimeType(null);
    setElapsedMs(0);
    setError(null);
    setNotice(null);
    setStatus('requesting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation !== generationRef.current) {
        stopStream(stream);
        return;
      }
      // Store the stream before constructing the recorder so constructor/start
      // failures also release the microphone.
      streamRef.current = stream;

      const supportedMimeType = preferredMimeType();
      const recorder = supportedMimeType
        ? new MediaRecorder(stream, { mimeType: supportedMimeType })
        : new MediaRecorder(stream);

      recorderRef.current = recorder;
      chunksRef.current = [];
      bytesRef.current = 0;

      recorder.ondataavailable = (event) => {
        if (generation !== generationRef.current) return;
        bytesRef.current += event.data.size;
        if (bytesRef.current > MAX_AUDIO_BYTES) {
          releaseMicrophone();
          chunksRef.current = [];
          setStatus('idle');
          setError('The recording exceeded 15 MB. Record a shorter memory.');
          return;
        }
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        if (generation !== generationRef.current) return;
        releaseMicrophone();
        chunksRef.current = [];
        setStatus('idle');
        setError('Recording stopped because the microphone reported an error.');
      };

      recorder.onstop = () => {
        if (generation !== generationRef.current) return;
        if (startedAtRef.current !== null) {
          setElapsedMs(Math.min(Date.now() - startedAtRef.current, maxDurationMs));
        }
        startedAtRef.current = null;
        stopStream(streamRef.current);
        streamRef.current = null;
        recorderRef.current = null;
        clearTimer();

        const recordedType = recorder.mimeType || chunksRef.current[0]?.type || supportedMimeType || '';
        if (!ACCEPTED_AUDIO_TYPES.has(baseContentType(recordedType))) {
          chunksRef.current = [];
          setStatus('idle');
          setError('This browser produced an unsupported audio format. Try another browser.');
          return;
        }
        const blob = new Blob(chunksRef.current, { type: recordedType });
        chunksRef.current = [];

        if (blob.size === 0) {
          setStatus('idle');
          setError('The recording was empty. Try again.');
          return;
        }

        const url = URL.createObjectURL(blob);
        urlRef.current = url;
        setAudioBlob(blob);
        setAudioUrl(url);
        setMimeType(recordedType);
        setStatus('stopped');
      };

      startedAtRef.current = Date.now();
      timerRef.current = window.setInterval(() => {
        if (startedAtRef.current === null) return;
        const elapsed = Date.now() - startedAtRef.current;
        if (elapsed >= maxDurationMs) {
          setElapsedMs(maxDurationMs);
          setNotice(`Recording stopped at the ${Math.round(maxDurationMs / 1000)} second limit.`);
          stopRecording();
          return;
        }
        setElapsedMs(elapsed);
      }, 200);

      limitTimerRef.current = window.setTimeout(() => {
        setNotice(`Recording stopped at the ${Math.round(maxDurationMs / 1000)} second limit.`);
        stopRecording();
      }, maxDurationMs);

      recorder.start(1000);
      setStatus('recording');
    } catch (error) {
      if (generation !== generationRef.current) return;
      releaseMicrophone();
      setStatus('idle');
      setError(messageForMediaError(error));
    }
  }, [clearTimer, maxDurationMs, releaseMicrophone, revokeUrl, stopRecording]);

  useEffect(() => {
    return () => {
      generationRef.current += 1;
      releaseMicrophone();
      revokeUrl();
    };
  }, [releaseMicrophone, revokeUrl]);

  return {
    status,
    error,
    notice,
    elapsedMs,
    audioBlob,
    audioUrl,
    mimeType,
    maxDurationMs,
    startRecording,
    stopRecording,
    discardRecording,
  };
}
