'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import type { NookInvitation, NookInvitationListResponse } from '@/lib/nooks/types';
import { acceptInvitation } from '@/lib/frontend/nook-api';
import { refreshNookLists } from '@/lib/frontend/nook-cache';
import { realNookHref } from '@/lib/frontend/real-nooks';
import { useNookData } from './use-nook-data';
import { NookRequestState } from './nook-request-state';
export function InvitationInbox({ viewerId }: { viewerId:number }) {
  const {data,error,mutate}=useNookData<NookInvitationListResponse>('/api/nook-invitations',viewerId);
  const [pending,setPending]=useState<number|null>(null); const lock=useRef(false);
  const [failure,setFailure]=useState<unknown>(null);const [joined,setJoined]=useState<number|null>(null);const [refreshFailed,setRefreshFailed]=useState(false);
  async function accept(invitation:NookInvitation) {
    if(lock.current)return;lock.current=true;setPending(invitation.id);setFailure(null);setJoined(null);setRefreshFailed(false);
    try {const result=await acceptInvitation(invitation.nookId,invitation.id);setJoined(result.nookId);try{await Promise.all([mutate(),refreshNookLists(viewerId)]);}catch{setRefreshFailed(true);}}
    catch(cause){setFailure(cause);}finally{lock.current=false;setPending(null);}
  }
  return <section id="invitations" className="recent-additions invitation-inbox" aria-label="Pending invitations"><h2>Invitations to your people’s Nooks</h2><p>Private Nook details become available after you accept. No invitation email is sent by Solibra.</p>
    {error?<NookRequestState error={error} retry={()=>void mutate()}/>:!data?<p role="status">Checking invitations…</p>:data.invitations.filter(item=>item.status==='pending'&&item.nookId!==joined).length?<ul>{data.invitations.filter(item=>item.status==='pending'&&item.nookId!==joined).map(item=><li key={item.id}><div><h3>Invitation #{item.id}</h3><p>{item.role==='owner'?'Owner':'Member'} invitation · {new Date(item.invitedAt).toLocaleDateString('en-US',{timeZone:'UTC'})}</p></div><button className="sol-outline-button" disabled={pending!==null} onClick={()=>void accept(item)}>{pending===item.id?'Joining…':'Accept invitation'}</button></li>)}</ul>:<p>No pending invitations.</p>}
    {joined&&<p role="status">Invitation accepted. <Link href={realNookHref(joined)}>Enter your Nook →</Link>{refreshFailed&&' Your membership is confirmed; refresh Library to update its list.'}</p>}{failure != null && <NookRequestState error={failure}/>}<button className="sol-text-link" disabled={pending!==null} onClick={()=>void Promise.all([mutate(),refreshNookLists(viewerId)]).catch(()=>setRefreshFailed(true))}>Refresh invitations and Library</button>
  </section>;
}
