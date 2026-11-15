'use client';
import { useActionState, useEffect, useRef } from 'react';
import { updatePassword, deleteAccount } from '@/app/(login)/actions';
import { Button } from '@/components/ui/button';

type State = { error?: string; success?: string };
function SecurityForm({ deletion = false }: { deletion?: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<State, FormData>(deletion ? deleteAccount : updatePassword, {});
  useEffect(() => { if (state.error || state.success) ref.current?.reset(); }, [state]);
  return <form ref={ref} action={action} className="account-form">
    {(deletion ? ['password'] : ['currentPassword','newPassword','confirmPassword']).map((name,index) => <label key={name}>{deletion ? 'Confirm your password' : ['Current password','New password','Confirm new password'][index]}<input name={name} type="password" required minLength={8} maxLength={100} autoComplete={index === 0 ? 'current-password' : 'new-password'} /></label>)}
    {state.error && <p role="alert">{state.error}</p>}{state.success && <p role="status">{state.success}</p>}
    <Button className="sol-button" disabled={pending}>{pending ? 'Please wait…' : deletion ? 'Delete account permanently' : 'Update Password'}</Button>
  </form>;
}
export function ProfileSecurity() {
  return <><details><summary>Password &amp; Security</summary><SecurityForm /></details><details className="account-danger"><summary>Danger Zone</summary><p>Deleting your account is permanent. Transfer ownership of any Nooks where you are the only owner first.</p><SecurityForm deletion /></details></>;
}
