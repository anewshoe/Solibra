'use client';
import useSWR from 'swr';
import { nookRequest } from '@/lib/frontend/nook-api';
export function useNookData<T>(path: string | null, viewerId: number | null) {
  return useSWR<T>(path && viewerId ? [path, viewerId] : null, ([url]: [string,number]) => nookRequest<T>(url), { shouldRetryOnError: false });
}
