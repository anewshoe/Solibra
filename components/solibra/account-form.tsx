'use client';

import Link from 'next/link';
import { useActionState, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import { updateAccount } from '@/app/(login)/actions';
import { Button } from '@/components/ui/button';
import type { AccountProfile } from '@/lib/frontend/account';
import { AccountAvatar } from './account-avatar';

type FormState = { error?: string; success?: string; fields?: { name?: string; email?: string } };
export function AccountInformationForm({ user, mode = 'edit', onCancel }: { user: AccountProfile; mode?: 'setup' | 'edit' | 'settings'; onCancel?: () => void }) {
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email);
  const [dirty, setDirty] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const router = useRouter();
  useEffect(() => { if (!dirty) { setName(user.name || ''); setEmail(user.email); } }, [user.name, user.email]);
  const [state, action, pending] = useActionState<FormState, FormData>(async (previous, form) => {
    const nextName = String(form.get('name') || '').trim();
    const nextEmail = mode === 'settings' ? String(form.get('email') || '').trim() : user.email;
    const fields = { name: !nextName || nextName.length > 100 ? 'Enter a display name, up to 100 characters.' : undefined, email: !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail) ? 'Enter a valid email address.' : undefined };
    if (fields.name || fields.email) return { fields };
    form.set('name', nextName); form.set('email', nextEmail);
    try {
      const result = await updateAccount(previous, form);
      if ('error' in result) return { error: result.error };
      setName(nextName); setEmail(nextEmail); setDirty(false);
      try { await mutate(key => key === '/api/user' || Array.isArray(key) && key[0] === '/api/user'); router.refresh(); setRefreshError(false); } catch { setRefreshError(true); }
      return { success: 'Your account information has been updated.' };
    } catch { return { error: 'We couldn’t update your account. Check your connection and sign-in, then try again. Your entries are still here.' }; }
  }, {});
  return <form data-mode={mode} className="account-form" action={action}>
    <AccountAvatar name={name} email={user.email} avatarUrl={user.avatarUrl} />
    <label htmlFor="account-name">Display name</label><input id="account-name" name="name" required maxLength={100} value={name} disabled={pending} onChange={event => { setName(event.target.value); setDirty(true); }} autoComplete="name" aria-invalid={!!state.fields?.name} aria-describedby="account-name-help account-name-error" />
    <small id="account-name-help">{name.length} / 100 characters</small><p id="account-name-error" role={state.fields?.name ? 'alert' : undefined}>{state.fields?.name}</p>
    {mode === 'settings' ? <><label htmlFor="account-email">Email address</label><input id="account-email" name="email" type="email" required value={email} disabled={pending} onChange={event => { setEmail(event.target.value); setDirty(true); }} autoComplete="email" aria-invalid={!!state.fields?.email} aria-describedby="account-email-error" /><p id="account-email-error" role={state.fields?.email ? 'alert' : undefined}>{state.fields?.email}</p></> : <><input type="hidden" name="email" value={user.email} /><div><p className="sol-eyebrow">ACCOUNT EMAIL</p><p>{user.email}</p></div></>}
    {state.error && <p className="account-feedback" role="alert">{state.error}</p>}
    {state.success && !dirty && <p role="status">{state.success}</p>}
    {refreshError && <p role="alert">Your update succeeded, but the account display could not refresh. Reload this page to see the latest details.</p>}
    <div className="account-actions"><Button className="sol-button" type="submit" disabled={pending}>{pending ? 'Saving…' : mode === 'setup' ? 'Save' : 'Save changes'}</Button>{mode !== 'setup' && (onCancel ? <button type="button" className="sol-outline-button" disabled={pending} onClick={onCancel}>Cancel</button> : <Link href="/profile" className="sol-outline-button" onClick={event => { if (pending) event.preventDefault(); }}>Cancel</Link>)}</div>
    {pending && <p role="status">Updating your account…</p>}
    {mode === 'setup' && state.success && !dirty && <Link href="/" className="sol-outline-button">Continue to Library →</Link>}
  </form>;
}
