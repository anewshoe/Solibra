'use client';
import { useEffect, useState } from 'react';
import { validatePhoto } from '@/lib/frontend/real-memories';

export function PhotoSelection({ file, onChange, disabled = false }: { file: File | null; onChange: (file: File | null) => void; disabled?: boolean }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!file) { setPreview(null); return; }
    const url = URL.createObjectURL(file); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <div className="photo-selection">
    <label>Choose a photograph<input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={event => {
      const chosen = event.target.files?.[0] || null;
      const invalid = chosen ? validatePhoto(chosen) : null;
      setError(invalid || ''); onChange(invalid ? null : chosen);
      if (invalid) event.target.value = '';
    }} aria-describedby="photo-help"/></label>
    <p id="photo-help" className="real-memory-help">JPEG, PNG, or WebP · up to 5,000,000 bytes. Your photograph stays private to this Nook.</p>
    {error && <p role="alert">{error}</p>}
    {file && <p>{file.name} · {file.size.toLocaleString()} bytes</p>}
    {preview && <img className="local-photo-preview" src={preview} alt="Your selected photograph preview"/>}
  </div>;
}

export function PrivatePhoto({ src, title, thumbnail = false }: { src: string; title: string; thumbnail?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <p className="private-photo-unavailable">Photograph unavailable. Refresh to check your access or try again.</p>;
  return <img src={src} alt={title} loading={thumbnail ? 'lazy' : 'eager'} className={thumbnail ? 'real-artifact-thumbnail' : 'memory-original-photo'} onError={() => setFailed(true)}/>;
}
