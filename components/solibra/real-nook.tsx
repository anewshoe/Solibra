'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { NookResponse, NookMembershipListResponse, NookInvitationListResponse } from '@/lib/nooks/types';
import type { ArtifactListResponse, ArtifactType } from '@/lib/memories/types';
import { NookRequestError, saveNookDescription } from '@/lib/frontend/nook-api';
import { refreshNookLists } from '@/lib/frontend/nook-cache';
import { useNookData } from './use-nook-data';
import { NookRequestState } from './nook-request-state';
import { NookDescription } from './nook-description';
import { AccountAvatar } from './account-avatar';
import { MemberProfileCard } from './member-profile';
import { Bookshelf } from './bookshelf';
import { InvitationQueueFields, useInvitationQueue } from './invitation-queue';
import { DesignIcon } from './shell';

function OwnerInvitations({ nookId, viewerId }: { nookId:number; viewerId:number }) {
  const queue=useInvitationQueue(nookId);
  const {data,error,mutate}=useNookData<NookInvitationListResponse>(`/api/nooks/${nookId}/invitations`,viewerId);
  const confirmedCount=queue.invitees.filter(item=>item.status==='created').length;
  useEffect(()=>{if(!queue.busy && confirmedCount) void mutate();},[queue.busy,confirmedCount,mutate]);
  return <section className="create-nook-panel owner-invitations" aria-label="Manage Nook invitations"><h2>Invite your people</h2><p>Create a pending invitation. Solibra does not send invitation emails.</p>{InvitationQueueFields(queue)}{queue.error&&<p role="alert">{queue.error.message}</p>}
    <h3>Invitation status</h3>{error?<NookRequestState error={error} retry={()=>void mutate()}/>:!data?<p role="status">Loading invitations…</p>:data.invitations.length?<ul>{data.invitations.map(item=><li key={item.id}>{item.email} · {item.status}</li>)}</ul>:<p>No invitations yet.</p>}<button className="sol-text-link" onClick={()=>void mutate()}>Refresh invitation status</button>
  </section>;
}
export function RealNook({ nookId, viewerId }: { nookId:number; viewerId:number }) {
  const detail=useNookData<NookResponse>(`/api/nooks/${nookId}`,viewerId);
  const verified=!!detail.data&&!detail.error;
  const members=useNookData<NookMembershipListResponse>(verified?`/api/nooks/${nookId}/members`:null,viewerId);
  const artifacts=useNookData<ArtifactListResponse>(verified?`/api/nooks/${nookId}/artifacts`:null,viewerId);
  const [query,setQuery]=useState('');const [category,setCategory]=useState<ArtifactType|'all'>('all');const [newest,setNewest]=useState(true);const [inviteOpen,setInviteOpen]=useState(false);
  if(detail.error)return <main id="main-content" className="sol-main"><Link href="/">← Library</Link><NookRequestState error={detail.error} retry={()=>void detail.mutate()}/></main>;
  if(!detail.data)return <main id="main-content" className="sol-main" aria-busy="true"><p role="status">Opening your Nook…</p></main>;
  const nook=detail.data.nook;
  if(nook.id !== nookId) return <main id="main-content" className="sol-main"><p role="alert">This Nook response could not be verified. Return to Library and try again.</p></main>;
  const actualMembers=members.data?.members.filter(member=>member.nookId===nookId) || [];
  const shown=(artifacts.data?.artifacts || []).filter(item=>item.nookId===nookId&&(category==='all'||item.type===category)&&`${item.title} ${item.description||''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())).sort((a,b)=>newest?b.createdAt.localeCompare(a.createdAt):a.createdAt.localeCompare(b.createdAt));
  async function save(id:number,description:string|null) {
    let response:NookResponse;
    try { response=await saveNookDescription(id,{description}); }
    catch(error){if(error instanceof NookRequestError && [401,403,404].includes(error.status))void detail.mutate();throw error;}
    await detail.mutate(response,{revalidate:false});
    void refreshNookLists(viewerId).catch(()=>{});return response;
  }
  return <main id="main-content" className="sol-main sol-nook-interior"><nav className="sol-breadcrumb" aria-label="Breadcrumb"><Link href="/">Library</Link><span>/</span><span aria-current="page">{nook.name}</span></nav>
    <div className="nook-introduction"><div><h1>{nook.name}</h1><NookDescription key={nook.id} description={nook.description} editor={{nook,save}}/></div>{nook.role==='owner'&&<button className="sol-outline-button" aria-expanded={inviteOpen} onClick={()=>setInviteOpen(value=>!value)}>Invite your people</button>}</div>
    <div className="nook-members">{members.error?<NookRequestState error={members.error} retry={()=>void members.mutate()}/>:!members.data?<p role="status">Loading members…</p>:<><div className="nook-member-avatars">{actualMembers.slice(0,6).map(member=><AccountAvatar key={member.id} name={member.user.name} email=""/>)}</div><p>{actualMembers.length} members · Private Nook · {nook.role==='owner'?'Owner':'Member'}</p></>}</div>
    {members.data&&!members.error&&<details className="real-member-details"><summary>View Nook member profiles</summary>{actualMembers.map(member=><MemberProfileCard key={member.id} membership={member} nookName={nook.name}/>)}</details>}
    {inviteOpen&&nook.role==='owner'&&<OwnerInvitations key={nookId} nookId={nookId} viewerId={viewerId}/>}
    <div className="memory-toolbar"><label className="sol-search"><DesignIcon name="search"/><span className="sr-only">Search this Nook</span><input id="memory-search" type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search this Nook…"/></label><div className="memory-filters" role="group" aria-label="Filter memories by type">{(['all','photo','audio','letter','text','other'] as const).map(type=><button key={type} aria-pressed={category===type} onClick={()=>setCategory(type)}>{type==='all'?'All memories':type[0].toUpperCase()+type.slice(1)}</button>)}</div><label><span className="sr-only">Sort memories</span><select value={newest?'newest':'oldest'} onChange={event=>setNewest(event.target.value==='newest')}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label></div>
    <Bookshelf nookName={nook.name}>{artifacts.error?<NookRequestState error={artifacts.error} retry={()=>void artifacts.mutate()}/>:!artifacts.data?<p role="status">Loading memories…</p>:shown.length?<div className="real-artifact-grid">{shown.map(item=><article key={item.id} className="real-artifact" data-artifact-id={item.id}><p className="sol-eyebrow">{item.type}</p><h3>{item.title}</h3>{item.description&&<p>{item.description}</p>}<small>Added {new Date(item.createdAt).toLocaleDateString('en-US',{timeZone:'UTC'})}</small></article>)}</div>:<p className="real-empty-shelf">{query||category!=='all'?'No memories match this search or filter.':'Your shelf is ready for the memories you’ll collect together.'}</p>}</Bookshelf>
    <p className="real-nook-hint">Memory metadata is shown here. Uploads, private media and voice persistence are being connected separately.</p>
  </main>;
}
