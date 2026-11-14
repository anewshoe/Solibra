'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import type { SampleCircle } from '@/lib/fixtures/library';
import { NookMemorabilia } from './nook-memorabilia';

export function NookWindow({ circle }: { circle: SampleCircle }) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const interiorId = useId();

  return (
    <article className="nook-window" aria-labelledby={titleId} data-open={open}>
      <button
        type="button"
        className="nook-arch-button"
        aria-label={`${open ? 'Close' : 'Open'} ${circle.title} doors`}
        aria-expanded={open}
        aria-controls={interiorId}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => { if (event.key === 'Escape') setOpen(false); }}
      >
        <span className="nook-arch" aria-hidden="true">
          <span className="nook-blush-border" />
          <span className="nook-interior" id={interiorId}><NookMemorabilia collection={circle.collection} /></span>
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
      <h2 id={titleId}>{circle.title}</h2>
      <p>{circle.memoryCount} memories <span aria-hidden="true">·</span> {circle.participantCount} people</p>
      <div className="nook-actions">
        {open ? <>
          <Link href={`/circles/${circle.id}`} className="nook-enter">Enter Nook <ArrowRight size={16} /></Link>
          <button onClick={() => setOpen(false)} aria-label={`Close ${circle.title} doors`}>Close doors</button>
        </> : <button onClick={() => setOpen(true)} aria-label={`Tap to open ${circle.title}`}>Tap to open <ArrowRight size={14} /></button>}
      </div>
    </article>
  );
}
