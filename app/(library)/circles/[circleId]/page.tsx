import { notFound } from 'next/navigation';
import { NookInterior } from '@/components/solibra/nook-interior';
import { sampleCircles } from '@/lib/fixtures/library';

export default async function NookPage({ params }: { params: Promise<{ circleId: string }> }) {
  const { circleId } = await params;
  const circle = sampleCircles.find((item) => item.id === circleId);
  if (!circle) notFound();
  return <NookInterior circle={circle} />;
}
