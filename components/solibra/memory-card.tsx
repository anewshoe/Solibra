'use client';

import Link from 'next/link';
import type { SampleMemory } from '@/lib/fixtures/library';
import { AudioPlayer } from './audio-player';
import { memoryHref, originalContributionId } from '@/lib/fixtures/conversations';

export function MemoryCard({ memory }: { memory: SampleMemory }) {
  return (
    <Link href={memoryHref(memory.circleId, memory.id)} className="sol-memory-card">
      <img src={memory.image} alt={memory.imageAlt || ''} className="sol-memory-photo" />
      <h3>{memory.title}</h3>
      <p className="memory-type">{memory.category === 'recipe' ? 'RECIPE' : 'PHOTOGRAPH'} <span aria-hidden="true">·</span> {memory.voices} voices</p>
      <p>{memory.contributors}</p>
    </Link>
  );
}

export function AudioMemoryCard({ memory }: { memory: SampleMemory }) {
  return (
    <article className="sol-audio-card" id="voice-story" aria-label="Elena’s voice memory">
      <div className="audio-introduction"><h3>In her own words</h3><p>Elena’s Sunday stories</p></div>
      <AudioPlayer src={memory.audioSrc} label="Elena’s original story" />
      <Link href={memoryHref(memory.circleId, memory.id, originalContributionId(memory.circleId))} className="audio-title">{memory.title}</Link>
      <p className="audio-language">Español <span aria-hidden="true">·</span> Original recording</p>
    </article>
  );
}
