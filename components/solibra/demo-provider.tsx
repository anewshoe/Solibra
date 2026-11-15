'use client';

import { createContext, useContext, useEffect, useReducer, useRef, useState } from 'react';
import { demoReducer, initialDemoState, type DemoState } from '@/lib/frontend/demo-state';
import { getArtifact, type Contribution, type MemberId, type ThreadId } from '@/lib/fixtures/conversations';
import { useVoicePreview } from './voice/use-voice-preview';
import { VoiceRecorderDialog } from './voice/recorder-dialog';

export interface RecordingTarget { circleId: string; artifactId: string; threadId: ThreadId; requestMessageId?: string; authorId: MemberId }
interface DemoContextValue {
  state: DemoState;
  sendText: (circleId: string, threadId: ThreadId, text: string) => void;
  shareArtifact: (circleId: string, artifactId: string, threadId?: ThreadId) => void;
  requestStory: (circleId: string, artifactId: string, threadId?: ThreadId) => string | undefined;
  openRecorder: (target: RecordingTarget) => void;
  updateTranslation: (contributionId: string, targetLanguage: string, translation: string) => void;
}
const DemoContext = createContext<DemoContextValue | null>(null);
export function useDemo() { const value = useContext(DemoContext); if (!value) throw new Error('Solibra demo provider is missing.'); return value; }

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(demoReducer, initialDemoState);
  const voice = useVoicePreview();
  const [target, setTarget] = useState<RecordingTarget | null>(null);
  const [pendingTarget, setPendingTarget] = useState<RecordingTarget | null>(null);
  const [open, setOpen] = useState(false);
  const attachedRef = useRef<string | null>(null);
  const [attachedId, setAttachedId] = useState<string | null>(null);
  const urlsRef = useRef(new Set<string>());
  useEffect(() => () => { urlsRef.current.forEach((url) => URL.revokeObjectURL(url)); urlsRef.current.clear(); }, []);
  const id = (kind: string) => `preview-${kind}:${crypto.randomUUID()}`;
  const now = () => new Date().toISOString();

  function sendText(circleId: string, threadId: ThreadId, text: string) {
    if (!text.trim()) return;
    dispatch({ type: 'message', message: { kind: 'text', messageId: id('message'), circleId, threadId, senderId: 'sofia', text: text.trim(), createdAt: now(), provenance: 'temporary' } });
  }
  function shareArtifact(circleId: string, artifactId: string, threadId: ThreadId = 'elena') {
    if (!getArtifact(circleId, artifactId)) return;
    dispatch({ type: 'message', message: { kind: 'artifact', messageId: id('message'), circleId, threadId, senderId: 'sofia', artifactId, createdAt: now(), provenance: 'temporary' } });
  }
  function requestStory(circleId: string, artifactId: string, threadId: ThreadId = 'elena') {
    const artifact = getArtifact(circleId, artifactId); if (!artifact) return;
    shareArtifact(circleId, artifactId, threadId);
    const messageId = id('request');
    dispatch({ type: 'message', message: { kind: 'request', messageId, circleId, threadId, senderId: 'sofia', artifactId, recipientId: 'elena', createdAt: now(), provenance: 'temporary', prompt: artifactId === 'sundays-in-her-kitchen' ? 'What made Sundays feel like home?' : `What do you remember about ${artifact.title.toLocaleLowerCase()}?` } });
    return messageId;
  }
  function openRecorder(next: RecordingTarget) {
    if (!getArtifact(next.circleId, next.artifactId)) return;
    const hasDraft = voice.recorder.audioBlob || voice.recorder.status === 'recording' || voice.recorder.status === 'requesting' || voice.recorder.status === 'stopping';
    if (hasDraft && target && (target.circleId !== next.circleId || target.artifactId !== next.artifactId || target.requestMessageId !== next.requestMessageId)) setPendingTarget(next);
    else { setTarget(next); setPendingTarget(null); }
    setOpen(true);
  }
  function close() {
    if (voice.recorder.status === 'recording') voice.recorder.stopRecording();
    if (voice.recorder.status === 'requesting') voice.recorder.discardRecording();
    setOpen(false); setPendingTarget(null);
  }
  function attach() {
    if (!target || !voice.transcript || !voice.recorder.audioBlob || !voice.draftId || voice.submitting || attachedRef.current === voice.draftId) return;
    const audioUrl = URL.createObjectURL(voice.recorder.audioBlob); urlsRef.current.add(audioUrl);
    const contribution: Contribution = { contributionId: voice.draftId, circleId: target.circleId, artifactId: target.artifactId, authorId: target.authorId, requestMessageId: target.requestMessageId,
      provenance: 'temporary', createdAt: now(), audioUrl, audioBlob: voice.recorder.audioBlob, durationMs: voice.recorder.elapsedMs,
      ...voice.transcript, translations: voice.result ? { [voice.result.targetLanguage]: voice.result.translation } : {} };
    dispatch({ type: 'contribution', contribution, message: { kind: 'voice', messageId: id('message'), circleId: target.circleId, artifactId: target.artifactId, threadId: target.threadId, senderId: target.authorId, contributionId: contribution.contributionId, createdAt: contribution.createdAt, provenance: 'temporary' } });
    attachedRef.current = voice.draftId; setAttachedId(voice.draftId);
  }
  return (
    <DemoContext.Provider value={{ state, sendText, shareArtifact, requestStory, openRecorder, updateTranslation: (contributionId, targetLanguage, translation) => dispatch({ type: 'translation', contributionId, targetLanguage, translation }) }}>
      {children}
      {target && <VoiceRecorderDialog open={open} onClose={close} target={target} pendingTarget={pendingTarget} voice={voice} attached={attachedId === voice.draftId && !!voice.draftId} onAttach={attach}
        onKeepTarget={() => setPendingTarget(null)} onSwitchTarget={() => { voice.discard(); setTarget(pendingTarget); setPendingTarget(null); setAttachedId(null); attachedRef.current = null; }} />}
      {target && !open && (voice.recorder.audioBlob || voice.recorder.status === 'recording' || voice.submitting) && <button className="voice-resume sol-outline-button" onClick={() => setOpen(true)}>Resume voice preview</button>}
    </DemoContext.Provider>
  );
}
