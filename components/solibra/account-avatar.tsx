import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { accountInitials } from '@/lib/frontend/account';

export function AccountAvatar({ name, email, avatarUrl }: { name?: string | null; email: string; avatarUrl?: string | null }) {
  return <Avatar className="account-avatar" aria-label={`${name?.trim() || 'Your account'} avatar`}>{avatarUrl && <AvatarImage src={avatarUrl} alt={name?.trim() || 'Profile photo'} />}<AvatarFallback>{accountInitials(name, email)}</AvatarFallback></Avatar>;
}
