import type { Nook } from '@/lib/nooks/types';

export function numericNookId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null;
}
export function realNookHref(id: number) {
  if (numericNookId(String(id)) !== id) throw new Error('Invalid real Nook ID');
  return `/circles/${id}`;
}
export function filterNooks(nooks: Nook[], tab: string, query: string): Nook[] {
  const matching = nooks.filter(nook => (tab !== 'shared' || nook.role === 'member') && `${nook.name} ${nook.description || ''}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return tab === 'recent' ? matching.sort((a,b) => (Date.parse(b.updatedAt) || Date.parse(b.createdAt) || 0) - (Date.parse(a.updatedAt) || Date.parse(a.createdAt) || 0) || b.id - a.id) : matching;
}
export const isNookListKey = (key: unknown) => key === '/api/nooks' || Array.isArray(key) && key[0] === '/api/nooks';
