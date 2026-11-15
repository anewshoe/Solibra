import { notFound } from 'next/navigation';
import { requireProfileUser } from '@/lib/auth/require-profile-user';
import { numericNookId } from '@/lib/frontend/real-nooks';
import { CreateMemory } from '@/components/solibra/create-memory';

export default async function CreateMemoryPage({ params }: { params: Promise<{ circleId: string }> }) {
  const { circleId } = await params;
  const nookId = numericNookId(circleId);
  if (!nookId) notFound();
  const user = await requireProfileUser();
  return <CreateMemory key={`${user.id}:${nookId}`} nookId={nookId} viewerId={user.id}/>;
}
