'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { sampleCircles } from '@/lib/fixtures/library';
import { RecentAdditions } from './recent-additions';
import { sampleRecentAdditions } from '@/lib/fixtures/recent-additions';
import { NookWindow } from './nook-window';
import { DesignIcon, useNotice } from './shell';

const tabs = [{ id: 'my', label: 'All Nooks', count: sampleCircles.length }, { id: 'shared', label: 'Shared with me' }, { id: 'recent', label: 'Recent' }] as const;

function LibraryCollection() {
  const params = useSearchParams();
  const router = useRouter();
  const selected = tabs.find((tab) => tab.id === params.get('tab'))?.id || 'my';
  const [query, setQuery] = useState('');
  const searchOpen = params.get('search') === '1';
  const circles = sampleCircles
    .filter((circle) => selected !== 'shared' || circle.sharedWithMe)
    .filter((circle) => circle.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
    .sort((a, b) => selected === 'recent' ? b.lastVisited.localeCompare(a.lastVisited) : 0);

  function selectTab(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set('tab', id);
    router.replace(`/?${next.toString()}#nooks`, { scroll: false });
  }

  return (
    <section id="nooks" className="library-wall" aria-label="Your private library wall">
      <div className="library-tabs" role="tablist" aria-label="Nook collections">
        {tabs.map((tab, index) => <button key={tab.id} role="tab" id={`tab-${tab.id}`} aria-selected={selected === tab.id} aria-controls="nook-collection" tabIndex={selected === tab.id ? 0 : -1} onClick={() => selectTab(tab.id)} onKeyDown={(event) => {
          const offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
          const target = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : offset ? tabs[(index + offset + tabs.length) % tabs.length] : undefined;
          if (target) { event.preventDefault(); selectTab(target.id); document.getElementById(`tab-${target.id}`)?.focus(); }
        }}>{tab.label}{'count' in tab && <span>{tab.count}</span>}</button>)}
      </div>
      {searchOpen && <label className="sol-search library-search" id="library-search"><DesignIcon name="search" /><span className="sr-only">Search Nooks</span><input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search your Nooks…" /></label>}
      <div className="nook-collection" id="nook-collection" role="tabpanel" aria-labelledby={`tab-${selected}`} tabIndex={0}>
        {circles.map((circle) => <NookWindow key={circle.id} circle={circle} />)}
        {!circles.length && <p className="sol-empty" role="status">No Nooks match “{query}”. Try another search.</p>}
      </div>
    </section>
  );
}

export function Library() {
  const notice = useNotice();
  return (
    <main id="main-content" className="sol-library">
      <img className="library-sunlight" src="/solibra/soft-sunlight.svg" width={579.755} height={589} alt="" aria-hidden="true" />
      <section className="library-welcome">
        <p className="sol-eyebrow">YOUR SHARED MEMORY LIBRARY</p>
        <h1>A little library.<br />A lifetime together.</h1>
        <p>Good morning, Sofía. There’s a story waiting for you.</p>
        <Button className="sol-button" onClick={() => notice('Create a Nook', 'Nook creation is coming next. You can explore the three sample Nooks in this frontend preview; nothing you do here creates or saves a Nook.')}><Plus size={16} />Create Nook</Button>
      </section>
      <Suspense fallback={<div className="library-wall" aria-busy="true">Opening your library…</div>}><LibraryCollection /></Suspense>
      <section className="library-invitation" aria-label="An invitation to share">
        <h2>Better with your people.</h2>
        <button onClick={() => notice('Invite your people', 'Sharing invitations are coming next. No invitation is sent from this sample library.')}>
          Invite someone into your family’s story. <ArrowRight size={16} />
        </button>
      </section>
      <RecentAdditions entries={sampleRecentAdditions} />
    </main>
  );
}
