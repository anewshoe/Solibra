'use client';
import { useEffect, useRef, useState } from 'react';
import { NookRequestError } from '@/lib/frontend/nook-api';

/** Scoped to a keyed account/resource component. Never automatically retries writes. */
export function useConfirmedWrite() {
  const lock = useRef(false);
  const mounted = useRef(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  async function run<T>(operation: () => Promise<T>, confirmed: (value: T) => Promise<void> | void) {
    if (lock.current) return;
    lock.current = true; setPending(true); setError(null);
    try {
      const value = await operation();
      if (mounted.current) await confirmed(value);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause : new Error('Unable to complete this request. Your draft is kept.'));
    } finally {
      lock.current = false;
      if (mounted.current) setPending(false);
    }
  }
  return { run, pending, error, clearError: () => setError(null), accessError: error instanceof NookRequestError && [401,403,404].includes(error.status) ? error : null };
}
