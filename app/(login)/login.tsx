'use client';

import Link from 'next/link';
import { useActionState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { BrandLogo } from '@/components/solibra/brand-logo';
import { signIn, signUp } from './actions';
import type { ActionState } from '@/lib/auth/middleware';

export function Login({ mode = 'signin' }: { mode?: 'signin' | 'signup' }) {
  const inviteId = useSearchParams().get('inviteId');
  const passwordRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(mode === 'signin' ? signIn : signUp, { error: '' });
  // No submitted password is echoed from the action or repopulated on failure.
  useEffect(() => { if (state.error && passwordRef.current) passwordRef.current.value = ''; }, [state]);
  return <main className="account-auth" id="main-content">

    <div className="account-auth-grid"><section className="account-welcome"><Link href="/" className="auth-brand" aria-label="Solibra Library"><BrandLogo /></Link><h1>{mode === 'signin' ? 'Welcome back to your little library.' : 'Every story starts somewhere.'}</h1><p>A little space for the people, moments, and voices you want to keep close.</p></section>
    <section className="account-card" aria-label={mode === 'signin' ? 'Sign In' : 'Create Account'}><h2>{mode === 'signin' ? 'Come on in.' : 'Make yourself at home.'}</h2>
      <form action={formAction} className="account-form">
        <input type="hidden" name="inviteId" value={inviteId || ''} />
        <label htmlFor="email">Email</label><input id="email" name="email" type="email" autoComplete="email" defaultValue={state.email} required maxLength={255} placeholder="you@example.com" />
        <label htmlFor="password">Password</label><input ref={passwordRef} id="password" name="password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} required minLength={8} maxLength={100} aria-describedby="password-hint" />
        <small id="password-hint">8–100 characters</small>
        {state.error && <p className="account-feedback" role="alert">{state.error}</p>}
        <Button className="sol-button" type="submit" disabled={pending}>{pending ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}</Button>
        {pending && <p role="status">{mode === 'signin' ? 'Signing in…' : 'Creating your account…'}</p>}
      </form>
      <div className="account-switch"><p>{mode === 'signin' ? 'New to Solibra?' : 'Already have an account?'}</p><Link className="sol-outline-button" href={`${mode === 'signin' ? '/sign-up' : '/sign-in'}${inviteId ? `?inviteId=${encodeURIComponent(inviteId)}` : ''}`}>{mode === 'signin' ? 'Create an Account' : 'Sign In'}</Link></div>
    </section></div>
  </main>;
}
