'use client';
import Link from 'next/link';
import type { NookListResponse } from '@/lib/nooks/types';
import { useNookData } from './use-nook-data';
import { NookRequestState } from './nook-request-state';
export function MessageNookSelector({viewerId}:{viewerId:number}) {
  const {data,error,mutate}=useNookData<NookListResponse>('/api/nooks',viewerId);
  return <main id="main-content" className="sol-main"><h1>Messages for your people.</h1><p>Choose a Nook to open its shared group conversation.</p>{error?<NookRequestState error={error} retry={()=>void mutate()}/>:!data?<p role="status">Loading your Nooks…</p>:data.nooks.length?<ul className="message-nook-list">{data.nooks.map(nook=><li key={nook.id}><h2>{nook.name}</h2><Link className="sol-outline-button" href={`/messages/${nook.id}`}>Open conversation</Link></li>)}</ul>:<p>You don’t have any Nooks yet. <Link href="/nooks/new">Create a Nook</Link></p>}</main>;
}
