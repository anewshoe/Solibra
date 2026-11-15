import type { User } from '@/lib/db/schema';

export type AccountProfile = Pick<User, 'id' | 'name' | 'email'>;
export function accountInitials(name: string | null | undefined, email: string) {
  const words = name?.trim().split(/\s+/).filter(Boolean);
  return words?.length ? words.slice(0, 2).map(word => [...word][0]).join('').toLocaleUpperCase() : [...email][0]?.toLocaleUpperCase() || '?';
}
export function withoutPasswordHash(user: User | null) {
  if (!user) return null;
  const { passwordHash: _passwordHash, ...profile } = user;
  return profile;
}
