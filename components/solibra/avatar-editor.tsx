'use client';
import { useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { mutate } from 'swr';
import { uploadAvatar, removeAvatar } from '@/lib/frontend/avatar-client';
import type { AccountProfile } from '@/lib/frontend/account';
import { AccountAvatar } from './account-avatar';

export function AvatarEditor({ user }: { user: AccountProfile }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const active = useRef(false);
  const id = useId();
  const router = useRouter();
  async function change(file?: File) {
    if (active.current) return;
    active.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const result = file ? await uploadAvatar(file) : await removeAvatar();
      setMessage(`${file ? 'Profile photo saved.' : 'Profile photo removed.'}${result.cleanupPending ? ' Old file cleanup is pending.' : ''}`);
      try {
        await mutate(key => key === '/api/user' || Array.isArray(key) && (key[0] === '/api/user' || typeof key[0] === 'string' && /^\/api\/nooks\/\d+\/members$/.test(key[0])));
        router.refresh();
      } catch { setError('Photo change saved. Refresh the page to update the displayed photo.'); }
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to change your photo. Refresh before retrying.'); }
    finally { active.current = false; setBusy(false); }
  }
  return <div className="account-form"><AccountAvatar name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
    <label htmlFor={id}>{user.avatarUrl ? 'Change profile photo' : 'Upload profile photo'}</label>
    <input id={id} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void change(file); }} />
    <small>JPEG, PNG or WebP. Maximum 2 MB. Visible only to you and people sharing a Nook.</small>
    {user.avatarUrl && <button type="button" className="sol-text-link" disabled={busy} onClick={() => void change()}>Remove profile photo</button>}
    {busy && <p role="status">Saving profile photo…</p>}{message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </div>;
}
