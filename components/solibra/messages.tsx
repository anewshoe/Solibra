'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Dialog } from 'radix-ui';
import { ArrowUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sampleMemories, type SampleCircle } from '@/lib/fixtures/library';
import { getArtifact, members, memoryHref, PRIMARY_ARTIFACT_ID, threads, type Contribution, type Message, type ThreadId } from '@/lib/fixtures/conversations';
import { useDemo } from './demo-provider';
import { MemberAvatar } from './member-avatar';
import { AudioPlayer } from './audio-player';
import { ContributionTranscript } from './voice/contribution-transcript';
import { NookWindow } from './nook-window';
import { useNotice } from './shell';
import { useConversationViewport } from './use-conversation-viewport';
import { languageLabel } from '@/lib/voice/languages';

export function MessageIcon({ name }: { name: 'back' | 'more' | 'attach' | 'microphone' }) {
  return <img src={`/solibra/${name}.svg`} width={24} height={24} alt="" aria-hidden="true" />;
}
function timestamp(message: Message) {
  return new Date(message.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function ArtifactMessage({ circle, artifactId }: { circle: SampleCircle; artifactId: string }) {
  const artifact = getArtifact(circle.id, artifactId);
  if (!artifact) return <p role="alert">This memory is unavailable in the preview.</p>;
  return <Link className="shared-memory-card" href={memoryHref(circle.id, artifactId)} data-artifact-id={artifactId}>
    <img src={artifact.image} alt={artifact.imageAlt || artifact.title} /><h3>{artifact.title}</h3><p>{circle.title} · View memory →</p>
  </Link>;
}

function VoiceMessage({ contribution }: { contribution: Contribution }) {
  const [originalOpen, setOriginalOpen] = useState(false);
  const target = Object.keys(contribution.translations)[0];
  return <div className="voice-message" data-contribution-id={contribution.contributionId}>
    <div className="contribution-player"><AudioPlayer src={contribution.audioUrl} durationMs={contribution.durationMs} label={`${members[contribution.authorId].name}’s original story`} /><p>{members[contribution.authorId].name}’s original story</p><small>{languageLabel(contribution.originalLanguage)} · Original recording</small></div>
    <div className="message-translation-preview"><p className="sol-eyebrow">{languageLabel(contribution.originalLanguage)} → {target ? languageLabel(target) : 'Translation pending'}</p><p>{target ? contribution.translations[target] : contribution.transcript}</p><button className="sol-text-link" aria-expanded={originalOpen} onClick={() => setOriginalOpen((value) => !value)}>{originalOpen ? 'Hide transcript' : 'See original transcript'} →</button>{originalOpen && <ContributionTranscript contribution={contribution} />}<Link href={memoryHref(contribution.circleId, contribution.artifactId, contribution.contributionId)} className="sol-text-link">View this voice in the memory →</Link></div>
  </div>;
}

function ConversationMessage({ message, circle }: { message: Message; circle: SampleCircle }) {
  const { state, openRecorder } = useDemo();
  const contribution = message.kind === 'voice' ? state.contributions.find((item) => item.contributionId === message.contributionId && item.circleId === circle.id && item.artifactId === message.artifactId) : undefined;
  return <div id={message.messageId} className={`conversation-message message-${message.kind} ${message.senderId === 'sofia' ? 'message-outgoing' : 'message-incoming'}`} data-message-id={message.messageId} data-artifact-id={message.kind === 'text' ? undefined : message.artifactId}>
    {message.kind === 'text' && <div className="message-bubble"><p>{message.text}</p><small>{members[message.senderId].name} · {timestamp(message)}</small></div>}
    {message.kind === 'artifact' && <ArtifactMessage circle={circle} artifactId={message.artifactId} />}
    {message.kind === 'request' && <article className="story-request-card" data-request-id={message.messageId}>
      <p className="sol-eyebrow">A LITTLE STORY REQUEST</p><h3>{message.prompt === 'What made Sundays feel like home?' ? <>What made Sundays<br />feel like home?</> : message.prompt}</h3><p>For {members[message.recipientId].name} · Reply whenever you like.</p>
      <Button className="sol-button" onClick={() => openRecorder({ circleId: circle.id, artifactId: message.artifactId, threadId: message.threadId, requestMessageId: message.messageId, authorId: message.recipientId })}>Record a story</Button>
      <Link className="request-artifact-link" href={memoryHref(circle.id, message.artifactId)}>About “{getArtifact(circle.id, message.artifactId)?.title}” →</Link>
      {state.contributions.some((item) => item.provenance === 'temporary' && item.requestMessageId === message.messageId) && <p role="status">Voice response preview added</p>}
    </article>}
    {message.kind === 'voice' && (contribution ? <VoiceMessage contribution={contribution} /> : <p role="alert">This temporary voice preview is no longer available.</p>)}
    {message.kind !== 'text' && <p className={`message-attribution ${message.kind === 'artifact' && message.provenance === 'fixture' ? 'sr-only' : ''}`}>{members[message.senderId].name} · {timestamp(message)}{message.provenance === 'temporary' ? ' · Temporary preview' : ''}</p>}
    {message.kind === 'text' && message.provenance === 'temporary' && <p className="message-attribution">Temporary preview · not sent to another account</p>}
  </div>;
}

export function FamilyMessages({ circle, initialRequestId }: { circle: SampleCircle; initialRequestId?: string }) {
  const { state, sendText, shareArtifact, requestStory, openRecorder } = useDemo();
  const notice = useNotice();
  const [threadId, setThreadId] = useState<ThreadId>('elena');
  const [text, setText] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mobileThreadsOpen, setMobileThreadsOpen] = useState(false);
  const [selectedArtifactId, setSelectedArtifactId] = useState(PRIMARY_ARTIFACT_ID);
  const [draftArtifactId, setDraftArtifactId] = useState<string | null>(null);
  const [pickerIntent, setPickerIntent] = useState<'attach' | 'record'>('attach');
  const main = useRef<HTMLElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const previousCount = useRef<number | null>(null);
  const handledRequest = useRef<string | undefined>(undefined);
  useConversationViewport(main);
  const thread = threads.find((item) => item.id === threadId)!;
  const messages = state.messages.filter((item) => item.circleId === circle.id && item.threadId === threadId);
  const artifacts = sampleMemories.filter((item) => item.circleId === circle.id && item.category !== 'voice');

  useEffect(() => {
    if (!initialRequestId || handledRequest.current === initialRequestId) return;
    const request = state.messages.find((item) => item.messageId === initialRequestId && item.circleId === circle.id);
    if (request) { setThreadId(request.threadId); handledRequest.current = initialRequestId; }
  }, [initialRequestId, circle.id, state.messages]);
  useEffect(() => {
    if (initialRequestId && document.getElementById(initialRequestId)) document.getElementById(initialRequestId)?.scrollIntoView({ block: 'center' });
  }, [initialRequestId, threadId]);
  useEffect(() => {
    if (previousCount.current !== null && messages.length > previousCount.current) scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
    previousCount.current = messages.length;
  }, [messages.length]);
  function chooseThread(next: ThreadId) { setThreadId(next); setText(''); setDraftArtifactId(null); previousCount.current = null; setMobileThreadsOpen(false); scroll.current?.scrollTo({ top: 0 }); }
  function submit(event: React.FormEvent) {
    event.preventDefault(); if (!text.trim() && !draftArtifactId) return;
    if (draftArtifactId) shareArtifact(circle.id, draftArtifactId, threadId);
    if (text.trim()) sendText(circle.id, threadId, text);
    setText(''); setDraftArtifactId(null);
  }
  function record() {
    const lastArtifact = [...messages].reverse().find((item) => item.kind !== 'text');
    const artifactId = draftArtifactId || lastArtifact?.artifactId;
    if (!artifactId) { setPickerIntent('record'); setPickerOpen(true); return; }
    openRecorder({ circleId: circle.id, artifactId, threadId, authorId: 'sofia' });
  }
  function pickerAction(action: 'attach' | 'share' | 'request') {
    if (pickerIntent === 'record') openRecorder({ circleId: circle.id, artifactId: selectedArtifactId, threadId, authorId: 'sofia' });
    else if (action === 'request') requestStory(circle.id, selectedArtifactId, threadId);
    else if (action === 'share') shareArtifact(circle.id, selectedArtifactId, threadId);
    else setDraftArtifactId(selectedArtifactId);
    setPickerOpen(false);
  }
  const conversationList = <nav aria-label="Conversations">{threads.map((item) => <button key={item.id} aria-current={threadId === item.id ? 'page' : undefined} onClick={() => chooseThread(item.id)}><MemberAvatar memberId={item.memberId} size={48} /><span><strong>{item.id === 'family' ? circle.title : item.name}</strong><small>{circle.id === 'rivera-family' ? item.preview : 'Start a conversation preview'}</small></span></button>)}</nav>;
  return <>
    <main id="main-content" className="messages-page" ref={main} data-circle-id={circle.id}>
      <h1 className="messages-page-heading">Conversations that become keepsakes.</h1>
      <div className="messages-workspace">
        <aside className="conversation-sidebar"><h2>Messages</h2>{conversationList}</aside>
        <section className="conversation-panel" aria-label={`Conversation with ${thread.name}`}>
          <header className="conversation-heading">
            <Link href={`/circles/${circle.id}`} className="sol-icon-button conversation-back" aria-label={`Back to ${circle.title}`}><MessageIcon name="back" /></Link>
            <MemberAvatar memberId={thread.memberId} size={40} /><div><h2>{thread.id === 'family' ? circle.title : thread.name}</h2><p className="conversation-mobile-description">{circle.title} · Español</p><p className="conversation-desktop-description">Your stories, in every language.</p></div>
            <button className="sol-icon-button conversation-more" aria-label="Conversation options" onClick={() => setMobileThreadsOpen(true)}><MessageIcon name="more" /></button>
          </header>
          <div className="thread-scroll" ref={scroll} role="log" aria-label="Conversation messages" aria-live="polite" tabIndex={0}>
            {messages.length ? <><p className="conversation-day">TODAY · 10:24 AM</p>{messages.map((message) => <ConversationMessage key={message.messageId} message={message} circle={circle} />)}</> : <div className="conversation-empty"><h3>A little hello is a good beginning.</h3><p>Write a message or choose a memory to request a story. This conversation is a temporary preview.</p><button className="sol-outline-button" onClick={() => { setPickerIntent('attach'); setPickerOpen(true); }}>Choose a memory</button></div>}
            <p className="conversation-preview-note">Preview only · Changes clear on refresh or when you leave the demo. Nothing is saved or shared between accounts.</p>
          </div>
          <form className="message-composer" onSubmit={submit} aria-label="Message composer">
            {draftArtifactId && <div className="composer-artifact"><span>{getArtifact(circle.id, draftArtifactId)?.title}</span><button className="sol-icon-button" type="button" aria-label="Remove attached memory" onClick={() => setDraftArtifactId(null)}><X size={18} /></button></div>}
            <div className="composer-row"><button type="button" className="sol-icon-button" aria-label="Attach a memory or request a story" onClick={() => { setPickerIntent('attach'); setPickerOpen(true); }}><MessageIcon name="attach" /></button>
              <label className="composer-input"><span className="sr-only">Message</span><textarea rows={1} value={text} onChange={(event) => setText(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); } }} placeholder="Message or ask for a memory…" /></label>
              {text.trim() || draftArtifactId ? <button className="composer-send sol-icon-button" type="submit" aria-label="Send message preview"><ArrowUp size={22} /></button> : <button className="sol-icon-button" type="button" aria-label="Record a voice message" onClick={record}><MessageIcon name="microphone" /></button>}
            </div>
          </form>
        </section>
        <aside className="messages-context"><h2>A shared thread</h2><p className="sol-eyebrow">{circle.title.toUpperCase()}</p><NookWindow circle={circle} initialOpen /><h3>Original voices, always.</h3><p>Stories stay in the language they were told. Translations help everyone feel at home.</p></aside>
      </div>
    </main>
    <Dialog.Root open={pickerOpen} onOpenChange={setPickerOpen}><Dialog.Overlay className="sol-dialog-overlay" /><Dialog.Content className="sol-dialog artifact-picker"><Dialog.Title>Choose a memory</Dialog.Title><Dialog.Description>Keep the story connected to its memory in {circle.title}. These are sample artifacts.</Dialog.Description><div className="artifact-picker-list" role="group" aria-label="Memory artifacts">{artifacts.map((artifact) => <button className="artifact-choice" key={artifact.id} aria-pressed={selectedArtifactId === artifact.id} onClick={() => setSelectedArtifactId(artifact.id)}><img src={artifact.image} alt="" /><span>{artifact.title}</span></button>)}</div><Button className="sol-button" onClick={() => pickerAction('request')}>{pickerIntent === 'record' ? 'Record for this memory' : 'Request a story about this memory'}</Button>{pickerIntent === 'attach' && <><button className="sol-outline-button" onClick={() => pickerAction('attach')}>Attach to message</button><button className="sol-text-link" onClick={() => pickerAction('share')}>Share memory preview</button></>}<Dialog.Close className="sol-icon-button sol-dialog-close" aria-label="Close"><X size={20} /></Dialog.Close></Dialog.Content></Dialog.Root>
    <Dialog.Root open={mobileThreadsOpen} onOpenChange={setMobileThreadsOpen}><Dialog.Overlay className="sol-dialog-overlay" /><Dialog.Content className="sol-dialog conversation-options"><Dialog.Title>Family conversations</Dialog.Title><Dialog.Description>Choose a conversation in {circle.title}. All messages are sample or temporary content.</Dialog.Description>{conversationList}<button className="sol-text-link" onClick={() => { setMobileThreadsOpen(false); notice('Conversation previews', 'Live conversation loading and delivery will be connected when the messaging API contract is available.'); }}>About this preview</button><Dialog.Close className="sol-icon-button sol-dialog-close" aria-label="Close"><X size={20} /></Dialog.Close></Dialog.Content></Dialog.Root>
  </>;
}
