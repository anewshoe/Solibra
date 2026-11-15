import Link from 'next/link';
import { BookOpen, AudioLines } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Artifact } from '@/lib/memories/types';
import { memoryBookAppearance } from '@/lib/frontend/memory-books';
import { artifactMediaPath, memoryTypeLabel, realMemoryHref } from '@/lib/frontend/real-memories';
import { PrivatePhoto } from './photo-attachment';

export function MemoryBook({ artifact }: { artifact: Artifact }) {
  const appearance = memoryBookAppearance(artifact.id);
  return <div className="memory-book-slot"><Link className="memory-book" data-book-color={appearance.color} data-artifact-id={artifact.id} style={{ '--book-height': `${appearance.height}px` } as CSSProperties} href={realMemoryHref(artifact.nookId, artifact.id)} aria-label={`${artifact.title} · ${memoryTypeLabel(artifact.type)} · View memory`}>
    <span className="memory-book-binding" aria-hidden="true"/>
    <span className="memory-book-type">{memoryTypeLabel(artifact.type)}</span>
    {artifact.type === 'photo' && artifact.mediaStorageKey ? <span className="memory-book-photo"><PrivatePhoto key={artifact.updatedAt} src={`${artifactMediaPath(artifact)}?v=${encodeURIComponent(artifact.updatedAt)}`} title="" thumbnail/></span> : artifact.type === 'audio' ? <AudioLines size={22} aria-hidden="true"/> : <BookOpen size={22} aria-hidden="true"/>}
    <h3>{artifact.title}</h3><time dateTime={artifact.createdAt}>{new Date(artifact.createdAt).toLocaleDateString()}</time>
  </Link></div>;
}
