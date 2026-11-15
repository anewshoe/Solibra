import { requireProfileUser } from '@/lib/auth/require-profile-user';
import { Profile } from '@/components/solibra/profile';

export default async function ProfilePage() {
  const user = await requireProfileUser();
  return <main id="main-content" className="sol-main account-page"><p className="sol-eyebrow">YOUR PROFILE</p><h1>Your little corner of Solibra.</h1><Profile viewerId={user.id} /></main>;
}
