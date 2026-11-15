'use client';
import { useEffect, useRef, useState } from 'react';
import { createMessageSchema, type Message } from '@/lib/memories/types';
import { MessageSendError, sendNookMessage } from '@/lib/frontend/real-messages';

export function useMessageComposer(nookId: number, viewerId: number, onConfirmed: (message:Message)=>Promise<unknown>) {
  const [draft,setDraft]=useState('');const [pending,setPending]=useState(false);
  const [error,setError]=useState<MessageSendError|null>(null);const [notice,setNotice]=useState('');
  const locked=useRef(false);const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function send() {
    if(locked.current)return;
    const parsed=createMessageSchema.safeParse({content:draft});
    if(!parsed.success){setError(new MessageSendError(400,'Write a message with 1–5,000 characters.'));return;}
    locked.current=true;setPending(true);setError(null);setNotice('');
    try {
      const {message}=await sendNookMessage(nookId,parsed.data);
      if(!mounted.current)return;
      if(message.senderId!==viewerId)throw new MessageSendError(201,'The sender could not be confirmed. Refresh before retrying.',true);
      setDraft('');setNotice('Message saved.');
      try{await onConfirmed(message);}catch{if(mounted.current)setNotice('Message saved, but history could not refresh. Refresh the conversation; don’t resend it.');}
    } catch(cause) {if(mounted.current)setError(cause instanceof MessageSendError?cause:new MessageSendError(0,'The result is unknown. Refresh before retrying.',true));}
    finally{locked.current=false;if(mounted.current)setPending(false);}
  }
  return {draft,setDraft,pending,error,notice,send,clearError:()=>setError(null)};
}
