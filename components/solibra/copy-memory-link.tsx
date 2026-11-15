'use client';
import { useState } from 'react';
import { Link as LinkIcon } from 'lucide-react';

export function CopyMemoryLink() {
  const [notice, setNotice] = useState('');
  const [error, setError] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setError(false); setNotice('Link copied. Only existing Nook members can open this private memory.');
    } catch { setError(true); setNotice('Unable to copy. Copy this page’s address from your browser. Only Nook members can open it.'); }
  }
  return <div className="copy-memory-link"><button type="button" className="sol-outline-button" onClick={() => void copy()}><LinkIcon size={17} aria-hidden="true"/>Copy memory link</button><small>Private · Nook members only</small>{notice && <p role={error ? 'alert' : 'status'}>{notice}</p>}</div>;
}
