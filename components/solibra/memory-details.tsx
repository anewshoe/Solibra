'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from 'radix-ui';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SampleCircle } from '@/lib/fixtures/library';
import { members, originalContributionId, PRIMARY_ARTIFACT_ID, type Artifact, type Contribution } from '@/lib/fixtures/conversations';
import { MemberAvatar } from './member-avatar';
import { useDemo } from './demo-provider';
import { AudioPlayer } from './audio-player';
import { ContributionTranscript } from './voice/contribution-transcript';
import { formatDuration } from './voice/use-voice-preview';

function VoiceStory({ contribution }: { contribution: Contribution }) {
  return <>
    <div className="voice-attribution"><MemberAvatar memberId={contribution.authorId} size={48} /><div><p>{contribution.authorId === 'elena' ? 'Abuela Elena' : members[contribution.authorId].name}</p><small>{contribution.provenance === 'temporary' ? 'Temporary preview' : 'Recorded in Español'} · {formatDuration(contribution.durationMs)}</small></div></div>
    <div className="contribution-player"><AudioPlayer src={contribution.audioUrl} durationMs={contribution.durationMs} label={`${members[contribution.authorId].name}’s original story`} /><p>{members[contribution.authorId].name}’s original story</p><small>{contribution.originalLanguage.toUpperCase()} · Original recording</small></div>
    <ContributionTranscript key={contribution.contributionId} contribution={contribution} />
  </>;
}

export function MemoryDetails({ circle, artifact, initialContributionId }: { circle: SampleCircle; artifact: Artifact; initialContributionId?: string }) {
  const { state, shareArtifact, requestStory, openRecorder } = useDemo();
  const router = useRouter();
  const contributions = state.contributions.filter((item) => item.circleId === circle.id && item.artifactId === artifact.artifactId);
  const [selected, setSelected] = useState(initialContributionId || originalContributionId(circle.id));
  const [shareOpen, setShareOpen] = useState(false);
  useEffect(() => { if (initialContributionId) setSelected(initialContributionId); }, [initialContributionId]);
  const contribution = contributions.find((item) => item.contributionId === selected) || contributions[0];
  const requestedUnavailable = !!initialContributionId && !contributions.some((item) => item.contributionId === initialContributionId);
  const isKitchen = artifact.artifactId === PRIMARY_ARTIFACT_ID;
  const addVoice = () => openRecorder({ circleId: circle.id, artifactId: artifact.artifactId, threadId: 'elena', authorId: 'sofia' });
  function share(request: boolean) {
    const requestId = request ? requestStory(circle.id, artifact.artifactId) : undefined;
    if (!request) shareArtifact(circle.id, artifact.artifactId);
    setShareOpen(false); router.push(`/messages/${circle.id}${requestId ? `?request=${encodeURIComponent(requestId)}` : ''}`);
  }
  return <>
    <main id="main-content" className="sol-main memory-details" data-artifact-id={artifact.artifactId} data-circle-id={circle.id}>
      <nav className="sol-breadcrumb" aria-label="Breadcrumb"><Link href={`/circles/${circle.id}`}>← {circle.title}</Link><span aria-hidden="true">/</span><span>{artifact.category === 'recipe' ? 'Recipes' : 'Photographs'}</span></nav>
      <div className="memory-detail-introduction"><div><h1>{artifact.title}</h1><p>{artifact.metadata}</p></div><button className="sol-outline-button" onClick={() => setShareOpen(true)}>Share memory</button></div>
      <div className="memory-detail-grid">
        <section className="memory-original" aria-label="The original memory">
          <figure><img className="memory-original-photo" src={artifact.image} alt={artifact.imageAlt || artifact.title} /><figcaption>{artifact.caption}</figcaption></figure>
          <h2>{artifact.storyHeading}</h2><p className="memory-long-story">{artifact.story}</p>
          <section className="family-perspectives" aria-labelledby="perspectives-title">
            <h2 id="perspectives-title">One memory. Many points of view.</h2>
            <article className="family-perspective"><MemberAvatar memberId="sofia" /><div><h3>Sofía · Added {artifact.category === 'recipe' ? 'the recipe' : 'the photograph'}</h3><p>{isKitchen ? 'I found this in Mamá’s blue photo album. Abuela, is this when you taught me to press the tortillas?' : 'A family recipe, ready for another story.'}</p></div></article>
            {isKitchen && <article className="family-perspective"><MemberAvatar memberId="mateo" /><div><h3>Mateo · Added a memory</h3><p>That little radio! Abuelo would turn it up when his favorite song came on.</p></div></article>}
            {contributions.filter((item) => item.provenance === 'temporary').map((item) => <article className="family-perspective" key={item.contributionId} data-contribution-id={item.contributionId}><MemberAvatar memberId={item.authorId} /><div><h3>{members[item.authorId].name} · Temporary voice preview</h3><p>{item.transcript}</p><button className="sol-text-link" onClick={() => { setSelected(item.contributionId); document.getElementById('memory-voices')?.scrollIntoView({ block: 'start' }); }}>Hear this perspective →</button></div></article>)}
          </section>
          <button className="sol-outline-button request-memory-story" onClick={() => share(true)}>Ask Elena for a story about this memory</button>
        </section>
        <aside id="memory-voices" className="voice-story-panel" aria-label="Original voices and translations">
          <h2>{contribution?.authorId === 'elena' ? 'Hear it from her.' : 'Hear it in their own words.'}</h2>
          {requestedUnavailable && <p className="voice-help" role="status">The requested voice preview is unavailable. Temporary recordings clear on refresh. {contribution ? 'Showing an available sample story instead.' : 'You can record a new preview.'}</p>}
          {contribution ? <VoiceStory key={contribution.contributionId} contribution={contribution} /> : <p>This memory is waiting for its first voice. Record a temporary preview to hear it here.</p>}
          {contributions.length > 1 && <label className="contribution-choice"><span>Other voices in this memory</span><select aria-label="Choose voice contribution" value={contribution?.contributionId} onChange={(event) => setSelected(event.target.value)}>{contributions.map((item) => <option key={item.contributionId} value={item.contributionId}>{members[item.authorId].name} · {item.provenance === 'temporary' ? 'temporary preview' : item.contributionId === originalContributionId(circle.id) ? 'original story' : 'conversation reply'}</option>)}</select></label>}
          <Button className="sol-button" onClick={addVoice}>Add your voice</Button>
        </aside>
      </div>
    </main>
    <div className="memory-voice-sticky"><Button className="sol-button" onClick={addVoice}>Add your voice</Button></div>
    <Dialog.Root open={shareOpen} onOpenChange={setShareOpen}><Dialog.Overlay className="sol-dialog-overlay" /><Dialog.Content className="sol-dialog memory-share-dialog"><Dialog.Title>Share this memory</Dialog.Title><Dialog.Description>“{artifact.title}” will be linked in this tab’s sample conversation. Nothing is sent to another account.</Dialog.Description><Button className="sol-button" onClick={() => share(false)}>Share in Family Messages</Button><button className="sol-outline-button" onClick={() => share(true)}>Request Elena’s story</button><Dialog.Close className="sol-icon-button sol-dialog-close" aria-label="Close"><X size={20} /></Dialog.Close></Dialog.Content></Dialog.Root>
  </>;
}
