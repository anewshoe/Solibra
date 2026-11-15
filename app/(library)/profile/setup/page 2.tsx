import { requireProfileUser } from '@/lib/auth/require-profile-user';
import { AccountEditor } from '@/components/solibra/profile';

export default async function ProfileSetupPage() {
  const user = await requireProfileUser();
  return <main id="main-content" className="sol-main account-page account-page-narrow"><h1>Let&apos;s get to know you.</h1><p className="account-intro">Give your stories a name the people you love will recognize.</p><AccountEditor viewerId={user.id} mode="setup" /></main>;
}
