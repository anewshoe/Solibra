import { requireProfileUser } from '@/lib/auth/require-profile-user';
import { AccountTheme } from '@/components/solibra/account-theme';
import { AccountEditor } from '@/components/solibra/profile';

export default async function GeneralPage() {
  const user = await requireProfileUser();
  return <AccountTheme><section className="account-page account-settings"><h1>General Settings</h1><AccountEditor viewerId={user.id} mode="settings" /></section></AccountTheme>;
}
