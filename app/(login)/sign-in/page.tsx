import { AccountTheme } from '@/components/solibra/account-theme';
import { Suspense } from 'react';
import { Login } from '../login';

export default function SignInPage() {
  return (
    <AccountTheme><Suspense fallback={<p className="account-loading">Opening Solibra…</p>}>
      <Login mode="signin" />
    </Suspense></AccountTheme>
  );
}
