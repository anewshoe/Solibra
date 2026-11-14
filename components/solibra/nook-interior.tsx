'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { sampleMembers, sampleMemories, type MemoryCategory, type SampleCircle } from '@/lib/fixtures/library';
import { Bookshelf } from './bookshelf';
import { AudioMemoryCard, MemoryCard } from './memory-card';
import { DesignIcon, useNotice } from './shell';

const filters = [{ id: 'all', label: 'All memories' }, { id: 'photo', label: 'Photos' }, { id: 'recipe', label: 'Recipes' }, { id: 'voice', label: 'Voice' }] as const;

export function NookInterior({ circle }: { circle: SampleCircle }) {
  const notice = useNotice();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<MemoryCategory | 'all'>('all');
  const [newestFirst, setNewestFirst] = useState(true);
  const memories = sampleMemories
    .filter((memory) => memory.circleId === circle.id && (category === 'all' || category === memory.category))
    .filter((memory) => `${memory.title} ${memory.contributors} ${memory.category}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((a, b) => newestFirst ? b.createdAt.localeCompare(a.createdAt) : a.createdAt.localeCompare(b.createdAt));

  function filterFromShelf(next: MemoryCategory) {
    setCategory(next);
    document.getElementById('recent-memories')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  }

  return (
    <main id="main-content" className="sol-main sol-nook-interior">
      <nav aria-label="Breadcrumb" className="sol-breadcrumb"><Link href="/">Library</Link><span aria-hidden="true">/</span><span aria-current="page">{circle.title}</span></nav>
      <div className="nook-introduction">
        <div><h1>{circle.title}</h1><p>{circle.description}</p></div>
        <Button className="sol-button" onClick={() => notice('Add a memory', 'Memory uploads are coming in a later frontend pass. The memories shown here are sample data; this action does not upload or save anything.')}><Plus size={16} />Add memory</Button>
      </div>
      <div className="nook-members">
        <div className="nook-member-avatars">{sampleMembers.map((member) => <Avatar key={member.name} className="size-9"><AvatarImage src={member.image} alt={member.name} /><AvatarFallback>{member.name[0]}</AvatarFallback></Avatar>)}</div>
        <p>{circle.participantCount} people · Private Nook</p>
      </div>
      <div className="memory-toolbar">
        <label className="sol-search"><DesignIcon name="search" /><span className="sr-only">Search this Nook</span><input id="memory-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this Nook…" /></label>
        <div className="memory-filters" role="group" aria-label="Filter memories by category">
          {filters.map((filter) => <button key={filter.id} aria-pressed={category === filter.id} onClick={() => setCategory(filter.id)}>{filter.label}{filter.id === 'all' && <span className="desktop-memory-count">{circle.memoryCount}</span>}{filter.id === 'voice' && <span className="desktop-voice-label"> stories</span>}</button>)}
        </div>
        <label className="memory-sort"><span className="sr-only">Sort memories</span><select value={newestFirst ? 'newest' : 'oldest'} onChange={(event) => setNewestFirst(event.target.value === 'newest')}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label>
      </div>
      <Bookshelf circle={circle} onFilter={filterFromShelf} />
      <section id="recent-memories" className="recent-memories" aria-labelledby="fresh-title">
        <div className="fresh-heading"><h2 id="fresh-title">Fresh on the shelf</h2><button className="view-all" onClick={() => { setCategory('all'); setQuery(''); }}>View all memories <ArrowRight size={16} /></button></div>
        <div className="memory-grid">
          {memories.map((memory) => memory.category === 'voice' ? <AudioMemoryCard key={memory.id} memory={memory} /> : <MemoryCard key={memory.id} memory={memory} />)}
          {!memories.length && <p className="sol-empty" role="status">No sample memories match your search. Try another word or category.</p>}
        </div>
        {(category !== 'all' || query) && <p className="sol-results" role="status">{memories.length} sample {memories.length === 1 ? 'memory' : 'memories'} found</p>}
      </section>
    </main>
  );
}
