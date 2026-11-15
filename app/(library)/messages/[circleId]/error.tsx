'use client';

import Link from 'next/link';
export default function MessagesError({ reset }: { reset: () => void }) {
  return <main id="main-content" className="messages-page messages-route-state"><h1>This conversation could not open.</h1><p role="alert">Try again. Temporary previews remain available while the shared layout stays open.</p><button className="sol-outline-button" onClick={reset}>Try again</button><Link href="/">Back to Library</Link></main>;
}
