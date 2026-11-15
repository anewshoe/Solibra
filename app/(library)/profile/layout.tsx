import { requireProfileUser } from '@/lib/auth/require-profile-user';
import '@/components/solibra/account.css';

export default async function ProfileLayout({ children }: { children: React.ReactNode }) {
  await requireProfileUser();
  return children;
}
