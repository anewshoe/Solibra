'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { ArrowLeft, RefreshCw, Send, Users } from 'lucide-react';
import type { NookResponse,NookListResponse,NookMembershipListResponse } from '@/lib/nooks/types';
import type { MessageListResponse,ArtifactListResponse } from '@/lib/memories/types';
import { conversationHref,memberCountLabel,orderedMessages,senderName } from '@/lib/frontend/real-messages';
import { realMemoryHref } from '@/lib/frontend/real-memories';
import { NookRequestError } from '@/lib/frontend/nook-api';
import { useNookData } from './use-nook-data';
import { useConversationViewport } from './use-conversation-viewport';
import { useMessageComposer } from './use-message-composer';
import { NookRequestState } from './nook-request-state';
import { NookWindow } from './nook-window';

export function RealConversation({nookId,viewerId}:{nookId:number;viewerId:number}) {
  const main=useRef<HTMLElement>(null);const scroll=useRef<HTMLDivElement>(null);const nearBottom=useRef(true);const lastCount=useRef<number|null>(null);
  useConversationViewport(main);
  const detail=useNookData<NookResponse>(`/api/nooks/${nookId}`,viewerId);
  const verified=!!detail.data&&!detail.error&&detail.data.nook.id===nookId;
  const nooks=useNookData<NookListResponse>('/api/nooks',viewerId);
  const members=useNookData<NookMembershipListResponse>(verified?`/api/nooks/${nookId}/members`:null,viewerId);
  const history=useNookData<MessageListResponse>(verified?`/api/nooks/${nookId}/messages`:null,viewerId);
  const needsArtifacts=verified && !history.error && !!history.data?.messages.some(message=>message.nookId===nookId && message.artifactId!==null);
  const artifacts=useNookData<ArtifactListResponse>(needsArtifacts?`/api/nooks/${nookId}/artifacts`:null,viewerId);
  const composer=useMessageComposer(nookId,viewerId,async message=>{
    nearBottom.current=true;
    await history.mutate(current=>({messages:orderedMessages([...(current?.messages||[]),message],nookId)}),{revalidate:false});
    await history.mutate();
  });
  const messages=orderedMessages(history.data?.messages||[],nookId);
  const artifactAccessError=needsArtifacts && artifacts.error instanceof NookRequestError && [401,403,404].includes(artifacts.error.status) ? artifacts.error : null;
  const error=detail.error || members.error || history.error || artifactAccessError;
  const sendAccessError=composer.error&&[401,403,404].includes(composer.error.status)?composer.error:null;
  const blocked=error||sendAccessError;
  useEffect(()=>{
    if(lastCount.current===null || nearBottom.current){if(scroll.current)scroll.current.scrollTop=scroll.current.scrollHeight;}
    lastCount.current=messages.length;
  },[messages.length]);
  useEffect(()=>{if(sendAccessError){void Promise.all([detail.mutate(),members.mutate(),history.mutate()]).catch(()=>{});}},[sendAccessError]);
  if(blocked || !verified || !members.data || !history.data) return <main id="main-content" className="messages-page messages-route-state" ref={main}><Link className="sol-outline-button" href="/messages">← All conversations</Link>{blocked?<NookRequestState error={blocked} retry={()=>{void Promise.all([detail.mutate(),members.mutate(),history.mutate()]).then(()=>composer.clearError()).catch(()=>{});}}/>:detail.data&&!verified?<p role="alert">This Nook could not be verified.</p>:<p role="status">Opening your group conversation…</p>}{composer.draft && <p>Your unsent draft is kept in this tab.</p>}{sendAccessError?.status===401&&<Link href="/sign-in" target="_blank" rel="noopener noreferrer">Sign in in another tab, then refresh here</Link>}</main>;
  const nook=detail.data!.nook;
  const people=members.data.members.filter(member=>member.nookId===nookId);
  return <main id="main-content" className="messages-page real-conversation" ref={main} data-circle-id={nookId}>
    <h1 className="messages-page-heading">Conversations that become keepsakes.</h1>
    <div className="messages-workspace"><aside className="conversation-sidebar"><h2>Your Nooks</h2><nav aria-label="Nook conversations">{nooks.error?<NookRequestState error={nooks.error} retry={()=>void nooks.mutate()}/>:!nooks.data?<p role="status">Loading conversations…</p>:nooks.data.nooks.map(item=><Link key={item.id} href={conversationHref(item.id)} aria-current={item.id===nookId?'page':undefined}>{item.name}</Link>)}</nav><Link href="/">← Library</Link></aside>
      <section className="conversation-panel" aria-label={`Group conversation in ${nook.name}`}>
        <header className="conversation-heading"><Link className="sol-icon-button conversation-back" href="/messages" aria-label="Back to conversations"><ArrowLeft size={20}/></Link><span className="real-conversation-symbol" aria-hidden="true"><Users size={22}/></span><div><h2>{nook.name}</h2><p>{memberCountLabel(people.length)} · Group conversation</p></div><button className="sol-icon-button" aria-label="Refresh conversation" disabled={history.isValidating||composer.pending} onClick={()=>{void Promise.all([detail.mutate(),members.mutate(),history.mutate(),...(needsArtifacts?[artifacts.mutate()]:[])]).catch(()=>{});}}><RefreshCw size={20}/></button><Link className="real-open-nook" href={`/circles/${nookId}`}>View Nook</Link></header>
        <div className="thread-scroll" ref={scroll} role="log" aria-label="Group messages" onScroll={()=>{if(scroll.current)nearBottom.current=scroll.current.scrollHeight-scroll.current.scrollTop-scroll.current.clientHeight<80;}}>
          {!messages.length?<div className="conversation-empty"><h3>A little hello goes a long way.</h3><p>This shared conversation is ready for your first message.</p></div>:messages.map(message=>{
            const outgoing=message.senderId===viewerId;
            const artifact=message.artifactId===null||artifacts.error?null:artifacts.data?.artifacts.find(item=>item.id===message.artifactId&&item.nookId===nookId);
            return <article className={`conversation-message message-text ${outgoing?'message-outgoing':'message-incoming'}`} key={message.id} data-message-id={message.id}><div className="message-bubble"><p>{message.content}</p><small>{senderName(message,viewerId,people)} · <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'})}</time></small>{message.artifactId!==null&&<p className="real-message-artifact">Memory: {artifact?<Link href={realMemoryHref(nookId,artifact.id)}>{artifact.title} →</Link>:'Memory reference unavailable'}</p>}</div></article>;
          })}
        </div>
        <form className="message-composer" aria-label="Group message composer" onSubmit={event=>{event.preventDefault();void composer.send();}}>
          <div className="composer-row"><label className="composer-input"><span className="sr-only">Message</span><textarea rows={1} maxLength={5000} value={composer.draft} disabled={composer.pending} onChange={event=>composer.setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();if(!composer.pending)event.currentTarget.form?.requestSubmit();}}} placeholder="Share a little moment…" aria-describedby="group-message-help"/></label><button className="sol-icon-button composer-send" type="submit" disabled={composer.pending||!composer.draft.trim()} aria-label={composer.pending?'Sending message':'Send message'}><Send size={20}/></button></div>
          <p id="group-message-help" className="real-message-help">{composer.draft.length} / 5,000 · Shift+Enter for a new line</p>{composer.pending&&<p role="status">Sending…</p>}{composer.notice&&<p role="status">{composer.notice}</p>}{composer.error&&<div role="alert"><p>{composer.error.message}</p><button className="sol-text-link" type="button" onClick={()=>void history.mutate().catch(()=>{})}>Refresh before retrying</button></div>}
        </form>
      </section>
      <aside className="messages-context"><h2>A shared thread</h2><NookWindow nook={nook} initialOpen/><p>One conversation for everyone in this Nook. Refresh to check for new messages.</p><p>Share a memory from its details page. Voice messages aren’t connected here yet.</p></aside>
    </div>
  </main>;
}
