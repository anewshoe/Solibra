'use client';
import type { CSSProperties } from 'react';
import type { ArtifactListResponse } from '@/lib/memories/types';
import { memoryBookAppearance } from '@/lib/frontend/memory-books';
import { useNookData } from './use-nook-data';

export function WindowMemories({ nookId, viewerId, open }: { nookId: number; viewerId?: number; open: boolean }) {
  const { data, error } = useNookData<ArtifactListResponse>(open && viewerId ? `/api/nooks/${nookId}/artifacts` : null, viewerId ?? null);
  const books = !open || !viewerId || error ? [] : (data?.artifacts || []).filter(item => item.nookId === nookId).slice(-12);
  return <span className="real-window-shelves" aria-hidden="true">{[0,1].map(row => <span className="window-book-row" key={row}>{books.slice(row * 6, row * 6 + 6).map(artifact => {
    const { color, height } = memoryBookAppearance(artifact.id);
    return <span className="window-memory-book" key={artifact.id} data-book-color={color} style={{ '--mini-book-height': `${height / 3.5}px` } as CSSProperties}/>;
  })}</span>)}</span>;
}
