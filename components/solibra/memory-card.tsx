'use client';

import Link from 'next/link';
import type { SampleMemory } from '@/lib/fixtures/library';
import { useNotice } from './shell';

export function MemoryCard({ memory }: { memory: SampleMemory }) {
  return (
    <Link href={`/circles/${memory.circleId}/memories/${memory.id}`} className="sol-memory-card">
      <img src={memory.image} alt={memory.imageAlt || ''} className="sol-memory-photo" />
      <h3>{memory.title}</h3>
      <p className="memory-type">{memory.category === 'recipe' ? 'RECIPE' : 'PHOTOGRAPH'} <span aria-hidden="true">·</span> {memory.voices} voices</p>
      <p>{memory.contributors}</p>
    </Link>
  );
}

export function AudioMemoryCard({ memory }: { memory: SampleMemory }) {
  const notice = useNotice();
  const bars = [8, 25, 13, 30, 18, 35, 23, 11, 28, 16, 33, 21, 9, 26, 14, 31, 19, 36, 24, 12, 29, 17, 34, 22, 10, 27, 15, 32, 20, 8, 25, 13];
  return (
    <article className="sol-audio-card" id="voice-story" aria-label="Elena’s voice memory">
      <div className="audio-introduction"><h3>In her own words</h3><p>Elena’s Sunday stories</p></div>
      {memory.audioSrc ? <audio controls preload="none" src={memory.audioSrc}>Your browser does not support audio playback.</audio> : <div className="audio-controls">
        <button className="audio-play" aria-label="Play Elena’s original story (sample audio unavailable)" onClick={() => notice('Sample recording', 'This Figma preview has no audio file attached. Playback will be available when real voice memories are connected.')}><img src="/solibra/play.svg" width={44} height={44} alt="" /></button>
        <div className="audio-waveform" aria-hidden="true">{bars.map((height, index) => <span key={index} style={{ height }} className={index > 12 ? 'wave-unplayed' : ''} />)}</div>
        <span className="audio-duration" aria-label="Sample duration 1 minute 42 seconds">1:42</span>
      </div>}
      <Link href={`/circles/${memory.circleId}/memories/${memory.id}`} className="audio-title">{memory.title}</Link>
      <p className="audio-language">Español <span aria-hidden="true">·</span> Original recording</p>
    </article>
  );
}
