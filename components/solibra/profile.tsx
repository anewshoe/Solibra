'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR, { mutate } from 'swr';
import type { AccountProfile } from '@/lib/frontend/account';
import { fetchAccountData } from '@/lib/frontend/account-client';
import type { Nook, NookListResponse } from '@/lib/nooks/types';
import { signOut } from '@/app/(login)/actions';
import { AccountAvatar } from './account-avatar';
import { AccountInformationForm } from './account-form';
import { AvatarEditor } from './avatar-editor';
import { ProfileSecurity } from './profile-security';
import { NookMemberProfiles } from './member-profile';

export function AccountEditor({ mode, viewerId }: { mode: 'setup' | 'edit' | 'settings'; viewerId: number }) {
  const { data: user, error, isLoading, mutate: refresh } = useSWR<AccountProfile | null>(['/api/user', viewerId], ([url]: [string, number]) => fetchAccountData<AccountProfile | null>(url));
  if (error) return <div className="account-card" role="alert"><p>Couldn’t load your account.</p><button className="sol-text-link" onClick={() => void refresh()}>Try again</button><Link href="/sign-in">Sign in</Link></div>;
  if (isLoading || user === undefined) return <p role="status">Loading your account…</p>;
  if (!user) return <p>Your session has ended. <Link href="/sign-in">Sign in to continue.</Link></p>;
  return <section className="account-card"><h2>{mode === 'settings' ? 'Account information' : mode === 'setup' ? 'A name for your stories' : 'Edit your profile'}</h2><AvatarEditor user={user} /><AccountInformationForm key={user.id} user={user} mode={mode} /></section>;
}

export function Profile({ viewerId }: { viewerId: number }) {
  const { data: user, error: userError, isLoading, mutate: refreshUser } = useSWR<AccountProfile | null>(['/api/user', viewerId], ([url]: [string, number]) => fetchAccountData<AccountProfile | null>(url));
  const { data, error, mutate: refreshNooks } = useSWR<NookListResponse>(user ? ['/api/nooks', viewerId] : null, ([url]: [string, number]) => fetchAccountData<NookListResponse>(url));
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<Nook | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const router = useRouter();
  async function logout() {
    if (signingOut) return;
    setSigningOut(true); setSignOutError('');
    try { await signOut(); await mutate(() => true, undefined, { revalidate: false }); router.replace('/sign-in'); router.refresh(); }
    catch { setSignOutError('Couldn’t sign out. Please try again.'); setSigningOut(false); }
  }
  if (userError) return <div role="alert"><p>Couldn’t load your profile.</p><button className="sol-outline-button" onClick={() => void refreshUser()}>Try again</button></div>;
  if (isLoading || user === undefined) return <p role="status">Loading your profile…</p>;
  if (!user) return <p>Your session has ended. <Link href="/sign-in">Sign in</Link></p>;
  return <div className="account-profile-grid"><section className="account-card"><AccountAvatar name={user.name} email={user.email} avatarUrl={user.avatarUrl} /><h2>{user.name?.trim() || 'A name for your stories'}</h2><p className="account-email">{user.email}</p>{!user.name?.trim() && <Link className="sol-outline-button" href="/profile/setup">Complete Profile</Link>}<button className="sol-button sol-outline-button" onClick={() => setEditing(true)}>Edit Profile</button>{editing && <div className="inline-account-editor"><AvatarEditor user={user} /><AccountInformationForm user={user} mode="settings" onCancel={() => setEditing(false)} /><ProfileSecurity /></div>}<button className="sol-text-link" onClick={() => void logout()} disabled={signingOut}>{signingOut ? 'Signing out…' : 'Sign Out'}</button>{signOutError && <p role="alert">{signOutError}</p>}</section>
    <div className="account-nooks-column"><section className="account-card"><h2>Your Nooks</h2>{error ? <div role="alert"><p>Your Nooks couldn’t be loaded.</p><button className="sol-text-link" onClick={() => void refreshNooks()}>Try again</button></div> : !data ? <p role="status">Loading your Nooks…</p> : data.nooks.length ? <><p className="account-help">Your private Nooks and the people you share them with.</p><ul className="account-nook-list">{data.nooks.map(nook => <li key={nook.id}><div><h3>{nook.name}</h3><p>{nook.description || 'A little space for your shared memories.'}</p><small>{nook.role === 'owner' ? 'Owner' : 'Member'}</small></div><Link className="sol-outline-button" href={`/circles/${nook.id}`}>Enter Nook</Link><button className="sol-outline-button" onClick={() => setSelected(nook)}>View members<span className="sr-only"> of {nook.name}</span></button></li>)}</ul></> : <p>You don’t belong to any Nooks yet.</p>}<Link className="sol-text-link" href="/nooks/new">Create a Nook →</Link></section>
    {selected && data?.nooks.some(nook => nook.id === selected.id) && <NookMemberProfiles key={selected.id} nook={selected} viewerId={viewerId} onClose={() => setSelected(null)} />}</div>
  </div>;
}
