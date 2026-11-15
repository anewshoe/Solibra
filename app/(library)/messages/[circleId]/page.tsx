import { notFound } from 'next/navigation';
import { FamilyMessages } from '@/components/solibra/messages';
import { sampleCircles } from '@/lib/fixtures/library';

export default async function MessagesPage({ params, searchParams }: { params: Promise<{ circleId: string }>; searchParams: Promise<{ request?: string }> }) {
  const { circleId } = await params;
  const circle = sampleCircles.find((item) => item.id === circleId);
  if (!circle) notFound();
  const { request } = await searchParams;
  return <FamilyMessages key={circleId} circle={{...circle,title:`Demo · ${circle.title}`}} initialRequestId={request} />;
}
