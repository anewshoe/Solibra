import { numericNookId } from '@/lib/frontend/real-nooks';
import { requireProfileUser } from '@/lib/auth/require-profile-user';
import { RealConversation } from '@/components/solibra/real-conversation';
import { notFound } from 'next/navigation';
import { FamilyMessages } from '@/components/solibra/messages';
import { sampleCircles } from '@/lib/fixtures/library';

export default async function MessagesPage({ params, searchParams }: { params: Promise<{ circleId: string }>; searchParams: Promise<{ request?: string }> }) {
  const { circleId } = await params;
  const id = numericNookId(circleId);
  if (id) { const user = await requireProfileUser(); return <RealConversation key={`${user.id}:${id}`} nookId={id} viewerId={user.id}/>; }
  const circle = sampleCircles.find((item) => item.id === circleId);
  if (!circle) notFound();
  const { request } = await searchParams;
  return <FamilyMessages key={circleId} circle={{...circle,title:`Demo · ${circle.title}`}} initialRequestId={request} />;
}
