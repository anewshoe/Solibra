import { notFound } from 'next/navigation';
import Link from 'next/link';
import { NookInterior } from '@/components/solibra/nook-interior';
import { RealNook } from '@/components/solibra/real-nook';
import { sampleCircles } from '@/lib/fixtures/library';
import { numericNookId } from '@/lib/frontend/real-nooks';
import { requireProfileUser } from '@/lib/auth/require-profile-user';
export default async function NookPage({params}:{params:Promise<{circleId:string}>}) {
  const {circleId}=await params;const id=numericNookId(circleId);
  if(id){const user=await requireProfileUser();return <RealNook key={`${user.id}:${id}`} nookId={id} viewerId={user.id}/>;}
  const circle=sampleCircles.find(item=>item.id===circleId);if(!circle)notFound();
  return <><p className="demo-label" role="note">Demo Nook · Fictional people and sample memories. <Link href="/demo">Demo Library</Link> · <Link href="/">Your Library</Link></p><NookInterior circle={circle}/></>;
}
