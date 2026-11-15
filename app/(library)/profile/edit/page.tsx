import { requireProfileUser } from '@/lib/auth/require-profile-user';
import { AccountEditor } from '@/components/solibra/profile';

export default async function EditProfilePage() {
  const user = await requireProfileUser();
  return <main id="main-content" className="sol-main account-page account-page-narrow"><h1>A little more you.</h1><AccountEditor viewerId={user.id} mode="edit" /></main>;
}
