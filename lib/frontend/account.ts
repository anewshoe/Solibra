import type { User } from '@/lib/db/schema';
import { avatarUrl } from '@/lib/avatars/types';

export type AccountProfile = Pick<User, 'id' | 'name' | 'email'> & { avatarUrl?: string | null };
export function accountInitials(name: string | null | undefined, email: string) {
  const words = name?.trim().split(/\s+/).filter(Boolean);
  return words?.length ? words.slice(0, 2).map(word => [...word][0]).join('').toLocaleUpperCase() : [...email][0]?.toLocaleUpperCase() || '?';
}
export function withoutPasswordHash(user: User | null) {
  if (!user) return null;
  const { passwordHash: _passwordHash, avatarStorageKey: _avatarStorageKey, ...profile } = user;
  return { ...profile, avatarUrl: avatarUrl(user) };
}
