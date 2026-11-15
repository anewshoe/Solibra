import type { CSSProperties } from 'react';

const colors = ['pink', 'lilac', 'blue', 'green', 'yellow'] as const;

/** Decorative placeholders contain no account data and never delay real content. */
export function BookSkeletons({ miniature = false }: { miniature?: boolean }) {
  if (miniature) return <>{colors.slice(0, 4).map((color, index) => <span key={color} className="window-memory-book sol-skeleton" data-book-color={color} style={{ '--mini-book-height': `${42 + index % 3 * 7}px` } as CSSProperties} aria-hidden="true"/>)}</>;
  return <div className="real-book-grid" aria-hidden="true">{colors.map((color, index) => <div className="memory-book-slot" key={color}><div className="memory-book sol-skeleton" data-book-color={color} style={{ '--book-height': `${210 + index % 3 * 18}px` } as CSSProperties}><span className="memory-book-binding"/><span className="sol-skeleton-line"/><span className="sol-skeleton-line short"/></div></div>)}</div>;
}

export function LoadingStatus({ children }: { children: React.ReactNode }) {
  return <p className="sol-loading-status" role="status"><span className="sol-loading-mark" aria-hidden="true"/>{children}</p>;
}

export function WindowSkeletons() {
  return <div className="loading-window-grid" aria-busy="true"><LoadingStatus>Opening your Nooks…</LoadingStatus><div className="loading-window-cards" aria-hidden="true">{[0,1,2].map(index => <div className="loading-window-card" key={index}><div className="loading-window sol-skeleton"><span/><span/></div><div className="sol-skeleton-line"/></div>)}</div></div>;
}

export function PageSkeleton({ kind = 'nook', label }: { kind?: 'nook' | 'memory' | 'conversation' | 'profile'; label: string }) {
  return <div className={`sol-page-skeleton loading-${kind}`} aria-busy="true"><LoadingStatus>{label}</LoadingStatus><div aria-hidden="true"><div className="sol-skeleton-line loading-title"/><div className="sol-skeleton-line loading-meta"/><div className="loading-page-grid"><div className="loading-frame sol-skeleton">{kind === 'nook' ? <BookSkeletons/> : <><div className="loading-keepsake"/><div className="sol-skeleton-line"/><div className="sol-skeleton-line short"/></>}</div><div className="loading-perspectives"><div className="sol-skeleton-line"/><div className="sol-skeleton-line short"/><div className="loading-frame small sol-skeleton"/></div></div></div></div>;
}
