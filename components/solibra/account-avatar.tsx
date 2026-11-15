import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { accountInitials } from '@/lib/frontend/account';

export function AccountAvatar({ name, email }: { name?: string | null; email: string }) {
  return <Avatar className="account-avatar" aria-label={`${name?.trim() || 'Your account'} initials`}><AvatarFallback>{accountInitials(name, email)}</AvatarFallback></Avatar>;
}
