'use client';
import { useRef, useState } from 'react';
import { Mic, Square } from 'lucide-react';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { sendNookMessage, MessageSendError } from '@/lib/frontend/real-messages';
import { uploadPrivateMedia } from '@/lib/frontend/media-client';
import type { Message } from '@/lib/memories/types';
import type { MessageTranslationList, MessageVoiceResult, MessageVoicePartialFailure } from '@/lib/messages/types';
import { TARGET_LANGUAGES, languageLabel } from '@/lib/voice/languages';
import { useNookData } from './use-nook-data';
import { PrivateRecording } from './private-recording';
import { formatDuration } from './voice/use-voice-preview';

export function AudioMessageComposer({nookId,onSent}:{nookId:number;onSent:()=>Promise<unknown>}) {
  const recorder=useAudioRecorder();const [visible,setVisible]=useState(false);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const pendingId=useRef<number|null>(null);const lock=useRef(false);const uncertain=useRef(false);
  async function send() {
    if(lock.current||!recorder.audioBlob||uncertain.current)return;
    lock.current=true;setBusy(true);setError('');
    try {
      if(!pendingId.current)pendingId.current=(await sendNookMessage(nookId,{type:'audio'})).message.id;
      await uploadPrivateMedia(`/api/nooks/${nookId}/messages/${pendingId.current}/media`,recorder.audioBlob);
      // Clear the sent draft before refresh: a refresh failure must not trigger another upload/send.
      pendingId.current=null;recorder.discardRecording();setVisible(false);
      await onSent().catch(()=>setError('Recording sent. Refresh the conversation to see the latest messages.'));
    }catch(error){if(error instanceof MessageSendError&&error.uncertain)uncertain.current=true;setError(error instanceof Error?error.message:'Unable to send the recording. Refresh before retrying.');}
    finally {lock.current=false;setBusy(false);}
  }
  return <section className="audio-message-composer" aria-label="Voice message composer"><button type="button" className="sol-text-link" aria-expanded={visible} disabled={busy} onClick={()=>setVisible(value=>!value)}><Mic size={16}/> Voice message</button>
    {visible&&<><p>Record up to 120 seconds / 4 MiB. Preview before sending. Transcription is optional after sending.</p><output aria-label="Recording duration">{formatDuration(recorder.elapsedMs)}</output>
      {recorder.status==='recording'?<button type="button" className="sol-outline-button" onClick={recorder.stopRecording}><Square size={16}/> Stop recording</button>:<button type="button" className="sol-outline-button" disabled={busy||['requesting','stopping'].includes(recorder.status)||!!pendingId.current} onClick={()=>void recorder.startRecording()}>{recorder.audioBlob?'Record again':'Record'}</button>}
      {recorder.audioUrl&&<PrivateRecording src={recorder.audioUrl} label="Voice message preview"/>}
      {recorder.audioBlob&&<><button type="button" className="sol-button" disabled={busy||recorder.status!=='stopped'||uncertain.current} onClick={()=>void send()}>{busy?'Sending…':pendingId.current?'Retry attachment upload':'Send voice message'}</button><button type="button" className="sol-text-link" disabled={busy} onClick={()=>{recorder.discardRecording();pendingId.current=null;uncertain.current=false;setError('');}}>Discard recording</button></>}
      {recorder.error&&<p role="alert">{recorder.error}</p>}{recorder.notice&&<p role="status">{recorder.notice}</p>}
    </>}{error&&<p role="alert">{error}</p>}
  </section>;
}

export function AudioMessage({message,viewerId,canManage,onChanged}:{message:Message;viewerId:number;canManage:boolean;onChanged:()=>Promise<unknown>}) {
  const path=`/api/nooks/${message.nookId}/messages/${message.id}`;
  const saved=useNookData<MessageTranslationList>(message.originalTranscript?`${path}/translations`:null,viewerId);
  const [language,setLanguage]=useState('en');const [busy,setBusy]=useState(false);const [error,setError]=useState('');const lock=useRef(false);
  const translation=saved.data?.translations.find(item=>item.targetLanguage===language);
  async function operation(action:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError('');try{await action();await onChanged();await saved.mutate();}catch(error){setError(error instanceof Error?error.message:'Unable to update this recording.');}finally{lock.current=false;setBusy(false);}}
  async function process() {
    const response=await fetch(`${path}/${message.originalTranscript?'translations':'process'}`,{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({targetLanguage:language})});
    const body=await response.json() as MessageVoiceResult|MessageVoicePartialFailure;
    // Refresh even on partial failure: saved source text must become visible for a translation-only retry.
    if('message' in body)await onChanged();
    if(!response.ok)throw new Error('error' in body?body.error.message:'Voice processing failed. Retry later.');
  }
  return <div className="audio-message">
    {message.audioUrl?<PrivateRecording key={message.audioUrl} src={message.audioUrl} label="Private voice message"/>:<p>Recording not attached.</p>}
    {message.originalTranscript&&<><p><strong>Original · {languageLabel(message.sourceLanguage??'und')}</strong></p><p>{message.originalTranscript}</p></>}
    {message.audioUrl&&<><label>Translation language <select value={language} disabled={busy} onChange={event=>setLanguage(event.target.value)}>{TARGET_LANGUAGES.map(item=><option key={item.code} value={item.code}>{item.label}</option>)}</select></label>
      {translation?<p>{translation.translatedText}</p>:<p>{canManage?'Choose a language, then process or translate.':'No saved translation in this language yet. Ask the sender or a Nook owner.'}</p>}
      {canManage&&<button type="button" className="sol-text-link" disabled={busy} onClick={()=>void operation(process)}>{busy?'Processing…':message.originalTranscript?'Translate / retry':'Transcribe and translate'}</button>}
    </>}
    {canManage&&<><label>Replace recording <input type="file" accept="audio/webm,audio/mp4,audio/ogg,audio/wav,audio/mpeg,audio/aac" disabled={busy} onChange={event=>{const file=event.target.files?.[0];event.target.value='';if(file)void operation(async()=>{await uploadPrivateMedia(`${path}/media`,file);});}}/></label>{message.audioUrl&&<button type="button" className="sol-text-link" disabled={busy} onClick={()=>void operation(async()=>{const response=await fetch(`${path}/media`,{method:'DELETE',credentials:'same-origin'});if(!response.ok)throw new Error('Unable to remove this recording. Retry after refreshing.');})}>Remove recording</button>}</>}
    {(error||saved.error)&&<p role="alert">{error||'Saved translations could not be loaded. Refresh to check your access.'}</p>}
  </div>;
}
