'use client';
import { useEffect, useRef, useState } from 'react';
import { createMessageSchema, type Message } from '@/lib/memories/types';
import { MessageSendError, sendNookMessage } from '@/lib/frontend/real-messages';

export function useMessageComposer(nookId: number, viewerId: number, onConfirmed: (message:Message)=>Promise<unknown>) {
  const [draft,setDraft]=useState('');const [pending,setPending]=useState(false);
  const [error,setError]=useState<MessageSendError|null>(null);const [notice,setNotice]=useState('');
  const [linkedArtifactId,setLinkedArtifactId]=useState<number|null>(null);
  const [needsRefresh,setNeedsRefresh]=useState(false);const uncertain=useRef(false);
  const locked=useRef(false);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function send() {
    if(locked.current||uncertain.current)return;
    const parsed=createMessageSchema.safeParse({content:draft,...(linkedArtifactId===null?{}:{artifactId:linkedArtifactId})});
    if(!parsed.success){setError(new MessageSendError(400,'Write a message with 1–5,000 characters.'));return;}
    locked.current=true;setPending(true);setError(null);setNotice('');
    try {
      const {message}=await sendNookMessage(nookId,parsed.data);
      if(!mounted.current)return;
      if(message.senderId!==viewerId)throw new MessageSendError(201,'The sender could not be confirmed. Refresh before retrying.',true);
      setDraft('');setLinkedArtifactId(null);setNotice('Message saved.');
      try{await onConfirmed(message);}catch{if(mounted.current)setNotice('Message saved, but history could not refresh. Refresh the conversation; don’t resend it.');}
    } catch(cause) {if(mounted.current){const failure=cause instanceof MessageSendError?cause:new MessageSendError(0,'The result is unknown. Refresh before retrying.',true);setError(failure);if(failure.uncertain){uncertain.current=true;setNeedsRefresh(true);}}}
    finally{locked.current=false;if(mounted.current)setPending(false);}
  }
  return {draft,setDraft,linkedArtifactId,setLinkedArtifactId,pending,error,notice,send,needsRefresh,confirmRetryAfterInspection:()=>{uncertain.current=false;setNeedsRefresh(false);setError(null);},clearError:()=>{if(!uncertain.current)setError(null);}};
}
