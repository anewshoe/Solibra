'use client';
import { mutate } from 'swr';
import { isNookListKey } from './real-nooks';
export async function refreshNookLists(viewerId?: number) {
  if (viewerId === undefined) return mutate(isNookListKey, undefined, { revalidate: false });
  return mutate(key => isNookListKey(key) && Array.isArray(key) && key[1] === viewerId);
}
