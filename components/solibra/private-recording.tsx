'use client';
import { useEffect, useRef, useState } from 'react';

/** Native seeking uses the authenticated backend's Range support. No synthetic duration. */
export function PrivateRecording({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);
  const audio = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    setFailed(false);
    const player = audio.current;
    // React can replay setup/cleanup on the same element in development. Restore
    // the authorized URL after cleanup instead of leaving a source-less player.
    if (player && player.getAttribute('src') !== src) { player.src = src; player.load(); }
    return () => { player?.pause(); player?.removeAttribute('src'); player?.load(); };
  }, [src]);
  return <><audio key={src} ref={audio} controls preload="metadata" src={src} aria-label={label} onError={() => { audio.current?.pause(); setFailed(true); }} onLoadedMetadata={() => setFailed(false)}/>{failed && <div role="status"><p>This recording is unavailable. Check your access or retry its authorized media load.</p><button type="button" className="sol-outline-button" onClick={() => { setFailed(false); audio.current?.load(); }}>Retry audio</button></div>}</>;
}
