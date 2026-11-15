import Link from 'next/link';
import { NookRequestError } from '@/lib/frontend/nook-api';
export function NookRequestState({ error, retry }: { error: unknown; retry?: () => void }) {
  const known = error instanceof NookRequestError;
  return <div className="sol-empty" role="alert"><p>{known ? error.message : 'Unable to load this information.'}</p>{known && error.status === 401 ? <Link className="sol-outline-button" href="/sign-in">Sign in</Link> : retry && <button className="sol-outline-button" onClick={retry}>Try again</button>}</div>;
}
