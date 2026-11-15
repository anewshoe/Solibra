'use client';
import { useState } from 'react';

/** Native seeking uses the authenticated backend's Range support. No synthetic duration. */
export function PrivateRecording({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);
  return <><audio controls preload="metadata" src={src} aria-label={label} onError={() => setFailed(true)}/>{failed && <p role="status">This recording is unavailable. Refresh to check your access or try again later.</p>}</>;
}
