'use client';

import useSWR from 'swr';
import type { Nook, NookMembership, NookMembershipListResponse } from '@/lib/nooks/types';
import { fetchAccountData } from '@/lib/frontend/account-client';
import { AccountAvatar } from './account-avatar';

export function MemberProfileCard({ membership, nookName }: { membership: NookMembership; nookName: string }) {
  const joined = new Date(membership.joinedAt);
  return <article className="member-profile-card"><AccountAvatar name={membership.user.name} email="" avatarUrl={membership.user.avatarUrl} /><div><h3>{membership.user.name?.trim() || 'Nook member'}</h3><p>{membership.role === 'owner' ? 'Owner' : 'Member'} · {nookName}</p><small>{Number.isFinite(joined.getTime()) ? `Joined ${joined.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })}` : 'Joined date unavailable'}</small></div></article>;
}

export function NookMemberProfiles({ nook, viewerId, onClose }: { nook: Nook; viewerId: number; onClose: () => void }) {
  const valid = Number.isSafeInteger(nook.id) && nook.id > 0;
  const { data, error, isLoading, mutate } = useSWR<NookMembershipListResponse>(valid ? [`/api/nooks/${nook.id}/members`, viewerId] : null, ([url]: [string, number]) => fetchAccountData<NookMembershipListResponse>(url));
  return <section className="account-card" aria-label={`Members of ${nook.name}`}><div className="account-section-heading"><h2>People in {nook.name}</h2><button className="sol-outline-button" onClick={onClose}>Close members</button></div><p className="account-help">Private to this Nook. These profiles come from your authorized membership view.</p>
    {!valid || error ? <div role="alert"><p>Member profiles are unavailable. Your membership may have changed.</p>{valid && <button className="sol-text-link" onClick={() => void mutate()}>Try again</button>}</div> : isLoading || !data ? <p role="status">Loading members…</p> : data.members.length ? data.members.filter(member => member.nookId === nook.id).map(member => <MemberProfileCard key={member.id} membership={member} nookName={nook.name} />) : <p>No members to show.</p>}
  </section>;
}
