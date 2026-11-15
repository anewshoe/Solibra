'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Nook } from '@/lib/nooks/types';
import type { SampleCircle } from '@/lib/fixtures/library';
import { sampleMemories } from '@/lib/fixtures/library';
import { NookMemorabilia } from './nook-memorabilia';
import { WindowMemories } from './window-memories';

function Shutters() {
  return <>{(['left', 'right'] as const).map(side => <span className={`nook-door nook-door-${side}`} key={side}>
    {[0, 1, 2, 3, 4].map(line => <span className="nook-door-line" style={{ top: `${31.57 + line * 10.5}%` }} key={line} />)}
    <span className="nook-handle" />
  </span>)}</>;
}

export function NookWindow({ circle, nook, initialOpen = false, viewerId, publicPreview = false }: ({ circle: SampleCircle; nook?: never } | { nook: Nook; circle?: never }) & { initialOpen?: boolean; viewerId?: number; publicPreview?: boolean }) {
  const title = nook ? nook.name : circle!.title;
  const id = nook ? nook.id : circle!.id;
  const [open, setOpen] = useState(initialOpen);
  const titleId = useId();
  const interiorId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);

  if (publicPreview && circle) {
    const books = sampleMemories.filter(memory => memory.circleId === circle.id).slice(0, 4);
    return <article className="nook-window landing-window" data-open={open} aria-labelledby={titleId} onKeyDown={event => {
      if (event.key === 'Escape') { setOpen(false); toggleRef.current?.focus(); }
    }}>
      <div className="landing-window-invitation" aria-hidden="true"><span>Click me!</span><svg viewBox="0 0 90 60" fill="none"><path d="M8 8C62 0 80 22 42 49m0 0 1-15m-1 15 16-2" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
      <button ref={toggleRef} type="button" className="nook-arch-button landing-window-toggle" aria-label={`${open ? 'Close' : 'Open'} the demo window`} aria-expanded={open} aria-controls={interiorId} onClick={() => setOpen(value => !value)}><span className="nook-arch" aria-hidden="true">
        <span className="nook-blush-border" aria-hidden="true" />
        <span className="nook-interior landing-window-interior" id={interiorId} hidden={!open}>
          <span className="landing-window-welcome">Little stories, waiting for you</span>
          <span className="landing-window-books">{books.map((book, index) => <span className="landing-window-book" data-cover={index} key={book.id}>
            <span className="book-imprint">SOLIBRA</span><span>{book.title}</span><small>{book.category === 'voice' ? 'A familiar voice' : book.category === 'recipe' ? 'Made with love' : 'A little moment'}</small>
          </span>)}</span>
        </span>
        <span className="nook-door-space landing-window-shutters"><Shutters /></span>
      </span></button>
      <h3 id={titleId}>A shelf full of possibilities.</h3>
    </article>;
  }

  return (
    <article className="nook-window" aria-labelledby={titleId} data-open={open}>
      <button
        type="button"
        className="nook-arch-button"
        aria-label={`${open ? 'Close' : 'Open'} ${title} doors`}
        aria-expanded={open}
        aria-controls={interiorId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
      >
        <span className="nook-arch" aria-hidden="true">
          <span className="nook-blush-border" />
          <span className="nook-interior" id={interiorId}>{circle ? <NookMemorabilia collection={circle.collection} /> : <WindowMemories nookId={nook!.id} viewerId={viewerId} open={open}/>}</span>
          <span className="nook-door-space">
            <Shutters />
          </span>
        </span>
      </button>
      <h2 id={titleId}>{title}</h2>
      <p>{circle ? <>{circle.memoryCount} memories <span aria-hidden="true">·</span> {circle.participantCount} people</> : <>{nook.role === 'owner' ? 'Owner' : 'Member'} · Private Nook</>}</p>
      <div className="nook-actions">
        {open ? <>
          <Link href={`/circles/${id}`} className="nook-enter">Enter Nook <ArrowRight size={16} /></Link>
          <button onClick={() => setOpen(false)} aria-label={`Close ${title} doors`}>Close doors</button>
        </> : <button onClick={() => setOpen(true)} aria-label={`Tap to open ${title}`}>Tap to open <ArrowRight size={14} /></button>}
      </div>
    </article>
  );
}
