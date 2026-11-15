import { notFound, redirect } from 'next/navigation';
import { sampleCircles } from '@/lib/fixtures/library';
import { canonicalArtifactId, getArtifact, memoryHref } from '@/lib/fixtures/conversations';
import { MemoryDetails } from '@/components/solibra/memory-details';
import { RealMemoryDetails } from '@/components/solibra/real-memory-details';
import { numericNookId } from '@/lib/frontend/real-nooks';
import { requireProfileUser } from '@/lib/auth/require-profile-user';

export default async function MemoryRoute({ params, searchParams }: { params: Promise<{ circleId: string; memoryId: string }>; searchParams: Promise<{ contribution?: string }> }) {
  const { circleId, memoryId } = await params;
  const nookId = numericNookId(circleId);
  const artifactId = numericNookId(memoryId);
  if (nookId || artifactId) {
    if (!nookId || !artifactId) notFound();
    const user = await requireProfileUser();
    return <RealMemoryDetails key={`${user.id}:${nookId}:${artifactId}`} nookId={nookId} artifactId={artifactId} viewerId={user.id}/>;
  }
  const circle = sampleCircles.find((item) => item.id === circleId);
  const artifact = getArtifact(circleId, memoryId);
  if (!circle || !artifact) notFound();
  if (canonicalArtifactId(memoryId) !== memoryId) redirect(memoryHref(circleId, memoryId));
  const { contribution } = await searchParams;
  return <><p className="demo-label" role="note">Demo memory · Fictional people and sample content.</p><MemoryDetails key={`${circleId}:${artifact.artifactId}`} circle={circle} artifact={artifact} initialContributionId={contribution} /></>;
}
