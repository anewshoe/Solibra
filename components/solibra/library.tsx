'use client';
import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { NookListResponse } from '@/lib/nooks/types';
import type { AccountProfile } from '@/lib/frontend/account';
import { filterNooks } from '@/lib/frontend/real-nooks';
import { NookWindow } from './nook-window';
import { DesignIcon } from './shell';
import { useNookData } from './use-nook-data';
import { NookRequestState } from './nook-request-state';
import { InvitationInbox } from './invitation-inbox';
import { PublicLanding } from './public-landing';
import { SolibraEmote } from './solibra-emote';

const tabs = [{ id:'my', label:'All Nooks' }, { id:'shared',label:'Shared with me' }, { id:'recent',label:'Recent' }] as const;
function Collection({ viewerId }: { viewerId: number }) {
  const params = useSearchParams(); const router = useRouter(); const [query,setQuery] = useState('');
  const selected = tabs.find(tab=>tab.id===params.get('tab'))?.id || 'my';
  const { data,error,mutate } = useNookData<NookListResponse>('/api/nooks',viewerId);
  const nooks = filterNooks(data?.nooks || [],selected,query);
  function select(id: string) { const next=new URLSearchParams(params.toString());next.set('tab',id);router.replace(`/?${next}#nooks`,{scroll:false}); }
  return <section id="nooks" className="library-wall" aria-label="Your private library wall"><div className="library-tabs" role="tablist" aria-label="Nook collections">{tabs.map((tab,index)=><button key={tab.id} role="tab" id={`tab-${tab.id}`} aria-selected={selected===tab.id} aria-controls="nook-collection" tabIndex={selected===tab.id?0:-1} onClick={()=>select(tab.id)} onKeyDown={event=>{const offset=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;const target=event.key==='Home'?tabs[0]:event.key==='End'?tabs[2]:offset?tabs[(index+offset+3)%3]:null;if(target){event.preventDefault();select(target.id);document.getElementById(`tab-${target.id}`)?.focus();}}}>{tab.label}{tab.id==='my' && data && <span>{data.nooks.length}</span>}</button>)}</div>
    <label className="sol-search library-search"><DesignIcon name="search"/><span className="sr-only">Search Nooks</span><input id="library-search" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search your Nooks…" /></label>
    {selected==='recent' && <p className="real-nook-hint">Most recently updated Nooks first. This is not a visit history.</p>}
    <div id="nook-collection" className="nook-collection" role="tabpanel" aria-labelledby={`tab-${selected}`} tabIndex={0}>{error ? <NookRequestState error={error} retry={()=>void mutate()}/> : !data ? <p role="status">Opening your Nooks…</p> : nooks.length ? nooks.map(nook=><NookWindow key={nook.id} nook={nook} viewerId={viewerId}/>) : <p className="sol-empty" role="status">{query ? 'No Nooks match your search.' : selected==='shared' ? 'No shared Nooks yet. Accepted member invitations will appear here.' : 'Your library is waiting for its first Nook. Create a Nook to begin.'}</p>}</div>
  </section>;
}
export function Library({ user }: { user: AccountProfile | null }) {
  if (!user) return <PublicLanding/>;
  return <main id="main-content" className="sol-library"><img className="library-sunlight" src="/solibra/soft-sunlight.svg" width={579.755} height={589} alt="" aria-hidden="true"/>
    <section className="library-welcome"><p className="sol-eyebrow">YOUR SHARED MEMORY LIBRARY</p><h1>A little library.<br/>A lifetime together.</h1><p>{user ? `Welcome${user.name?.trim() ? `, ${user.name.trim()}` : ''}. Your shared stories have a home here.` : 'Sign in to browse your private Nooks and shared memories.'}</p><Button className="sol-button" asChild><Link href={user?'/nooks/new':'/sign-in'}><Plus size={16}/>{user?'Create Nook':'Sign In'}</Link></Button></section>
    {user ? <><Suspense fallback={<p className="library-wall" role="status">Opening your library…</p>}><Collection key={user.id} viewerId={user.id}/></Suspense><InvitationInbox viewerId={user.id}/><section className="recent-additions"><div className="library-section-heading"><SolibraEmote variant="reading" size={64}/><h2>Recent Additions</h2></div><p>Open a Nook to browse its memories. A cross-Nook activity feed is not connected yet.</p></section></> : <section className="library-wall sol-empty"><h2>A private place for your people.</h2><p>Your Nooks are only shown after you sign in.</p><Link className="sol-outline-button" href="/sign-up">Create an account</Link><Link className="sol-text-link" href="/demo">Explore the labeled demo library →</Link></section>}
  </main>;
}
