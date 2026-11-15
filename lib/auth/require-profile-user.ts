import 'server-only';
import { getUser } from '@/lib/db/queries';
import { redirect } from 'next/navigation';
import { avatarUrl } from '@/lib/avatars/types';

export async function requireProfileUser() {
  // getUser verifies the signed session, expiry and active database account.
  const user = await getUser();
  if (!user) redirect('/sign-in');
  return { id: user.id, name: user.name, email: user.email, avatarUrl: avatarUrl(user) };
}
