'use client';
import Link from 'next/link';
import { ArrowUpRight, MessagesSquare } from 'lucide-react';
import type { NookListResponse } from '@/lib/nooks/types';
import { useNookData } from './use-nook-data';
import { NookRequestState } from './nook-request-state';
export function MessageNookSelector({viewerId}:{viewerId:number}) {
  const {data,error,mutate}=useNookData<NookListResponse>('/api/nooks',viewerId);
  return <main id="main-content" className="sol-main message-selector"><h1>Messages for your people.</h1><p>Choose a Nook to open its shared group conversation.</p>{error?<NookRequestState error={error} retry={()=>void mutate()}/>:!data?<p role="status">Loading your Nooks…</p>:data.nooks.length?<ul className="message-nook-list">{data.nooks.map(nook=><li key={nook.id}><Link className="message-group-card" href={`/messages/${nook.id}`}><MessagesSquare size={24} aria-hidden="true"/><div><h2>{nook.name}</h2><p>Shared group conversation</p></div><ArrowUpRight size={22} aria-hidden="true"/></Link></li>)}</ul>:<p>You don’t have any Nooks yet. <Link href="/nooks/new">Create a Nook</Link></p>}</main>;
}
