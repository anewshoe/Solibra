'use client';

import Link from 'next/link';
import { Dialog } from 'radix-ui';
import { Mic, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TARGET_LANGUAGES, languageLabel } from '@/lib/voice/languages';
import { AUDIO_SIZE_LABEL, MAX_RECORDING_DURATION_MS } from '@/lib/voice/audio';
import { getArtifact, members, memoryHref } from '@/lib/fixtures/conversations';
import type { RecordingTarget } from '../demo-provider';
import { formatDuration, useVoicePreview } from './use-voice-preview';
import { AudioPlayer } from '../audio-player';

export function VoiceRecorderDialog({ open, onClose, target, pendingTarget, voice, attached, onAttach, onKeepTarget, onSwitchTarget }: {
  open: boolean; onClose: () => void; target: RecordingTarget; pendingTarget: RecordingTarget | null;
  voice: ReturnType<typeof useVoicePreview>; attached: boolean; onAttach: () => void; onKeepTarget: () => void; onSwitchTarget: () => void;
}) {
  const { recorder } = voice;
  const artifact = getArtifact(target.circleId, target.artifactId)!;
  const active = ['requesting','recording','stopping'].includes(recorder.status);
  return <Dialog.Root open={open} onOpenChange={(value) => { if (!value) onClose(); }}>
    <Dialog.Overlay className="sol-dialog-overlay" />
    <Dialog.Content className="sol-dialog voice-dialog" aria-describedby="voice-dialog-description">
      <Dialog.Title>A story for {target.previewPersonaId === 'elena' ? 'Abuela' : 'your people'}</Dialog.Title>
      <Dialog.Description id="voice-dialog-description">A temporary voice preview for “{artifact.title}”.</Dialog.Description>
      {pendingTarget ? <div className="voice-switch-draft"><p>You already have a draft for this memory. Keep it, or discard it before changing the story request.</p><Button className="sol-button" onClick={onKeepTarget}>Keep current draft</Button><button className="sol-outline-button" onClick={onSwitchTarget}>Discard draft & switch</button></div> : <>
        <section className="voice-recorder" aria-label="Story recorder">
          <h3>Tell it in your own words.</h3><p>Any language. No perfect words needed.</p>
          <div className="voice-recording-status" data-recording={recorder.status === 'recording'}>
            {recorder.status === 'recording' && <span className="recording-dot" aria-hidden="true" />}
            <output aria-label="Recording duration">{formatDuration(recorder.elapsedMs)}</output>
            <span>{Math.floor(MAX_RECORDING_DURATION_MS / 60_000)} minutes / {AUDIO_SIZE_LABEL} max</span>
          </div>
          {recorder.status === 'recording' ? <Button className="sol-button" onClick={recorder.stopRecording}><Square size={16} />Stop recording</Button> : <Button className="sol-button" onClick={voice.start} disabled={active || voice.submitting}><Mic size={16} />{recorder.status === 'requesting' ? 'Waiting for microphone…' : recorder.status === 'stopping' ? 'Finishing recording…' : recorder.audioBlob ? 'Record again' : 'Record story'}</Button>}
          {recorder.audioUrl && <AudioPlayer key={recorder.audioUrl} src={recorder.audioUrl} durationMs={recorder.elapsedMs} label="your original recording" />}
          {recorder.notice && <p role="status">{recorder.notice}</p>}
          {recorder.error && <p className="voice-error" role="alert">{recorder.error}</p>}
        </section>
        {recorder.audioBlob && <section className="voice-processing" aria-label="Transcription and translation">
          <label className="sol-language-select">Translate to<select value={voice.targetLanguage} disabled={voice.submitting} onChange={(event) => voice.setTargetLanguage(event.target.value)}>{TARGET_LANGUAGES.map((language) => <option key={language.code} value={language.code}>{language.label}</option>)}</select></label>
          <p className="voice-help">Your spoken language is detected automatically.</p>
          <Button className="sol-button" disabled={voice.submitting || recorder.status !== 'stopped' || !!voice.result} onClick={() => void voice.process()}>{voice.submitting ? voice.transcript ? 'Translating…' : 'Transcribing and translating…' : voice.transcript ? voice.error ? 'Retry translation' : 'Translate transcript' : 'Process recording'}</Button>
          {voice.submitting && <p role="status">Processing your preview. Original audio remains available.</p>}
          {voice.error && <p className="voice-error" role="alert">{voice.error}</p>}
          {voice.needsSignIn && <Link href="/sign-in" target="_blank" rel="noopener noreferrer" className="sol-text-link">Sign in in a new tab, then retry here</Link>}
          {voice.transcript && <div className="voice-result">
            {!voice.result && <p role="status">Transcription complete. Translation is not complete. Retry translation without uploading the recording again.</p>}
            <h4>Original transcript · {languageLabel(voice.transcript.originalLanguage)}</h4><p>{voice.transcript.transcript}</p>
            {voice.result && <><h4>{languageLabel(voice.result.targetLanguage)} translation</h4><p>{voice.result.translation}</p></>}
          </div>}
        </section>}
        <p className="voice-help">Demo persona (not your signed-in identity): {members[target.previewPersonaId].name}. Nothing is saved or sent to another account.</p>
        <Button className="sol-button voice-use-preview" onClick={onAttach} disabled={!voice.transcript || voice.submitting || attached}>{attached ? 'Temporary preview added' : !recorder.audioBlob ? 'Record before previewing' : 'Use temporary preview'}</Button>
        {attached && <p role="status">Available in this tab’s conversation and <Link onClick={onClose} href={memoryHref(target.circleId, target.artifactId, voice.draftId || undefined)}>memory details</Link>. Refreshing clears the preview.</p>}
        {recorder.audioBlob && <button className="sol-text-link" onClick={voice.discard}>Discard recording</button>}
      </>}
      <button className="sol-outline-button voice-close" onClick={onClose}>{active ? 'Stop & keep draft' : recorder.audioBlob ? 'Keep draft & close' : 'Cancel'}</button>
    </Dialog.Content>
  </Dialog.Root>;
}
