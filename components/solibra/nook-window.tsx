'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { Nook } from '@/lib/nooks/types';
import type { SampleCircle } from '@/lib/fixtures/library';
import { NookMemorabilia } from './nook-memorabilia';

export function NookWindow({ circle, nook, initialOpen = false }: ({ circle: SampleCircle; nook?: never } | { nook: Nook; circle?: never }) & { initialOpen?: boolean }) {
  const title = nook ? nook.name : circle!.title;
  const id = nook ? nook.id : circle!.id;
  const [open, setOpen] = useState(initialOpen);
  const titleId = useId();
  const interiorId = useId();

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
          <span className="nook-interior" id={interiorId}>{circle ? <NookMemorabilia collection={circle.collection} /> : <span className="real-window-shelves"><i /><i /></span>}</span>
          <span className="nook-door-space">
            {(['left', 'right'] as const).map((side) => (
              <span className={`nook-door nook-door-${side}`} key={side}>
                {[0, 1, 2, 3, 4].map((line) => <span className="nook-door-line" style={{ top: `${31.57 + line * 10.5}%` }} key={line} />)}
                <span className="nook-handle" />
              </span>
            ))}
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
