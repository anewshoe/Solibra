import Link from 'next/link';
import { notFound } from 'next/navigation';
import { sampleCircles, sampleMemories } from '@/lib/fixtures/library';

// Route handoff only. The Figma memory-detail screen is outside this first pass.
export default async function MemoryRoute({ params }: { params: Promise<{ circleId: string; memoryId: string }> }) {
  const { circleId, memoryId } = await params;
  const circle = sampleCircles.find((item) => item.id === circleId);
  const memory = sampleMemories.find((item) => item.id === memoryId && item.circleId === circleId);
  if (!circle || !memory) notFound();
  return (
    <main id="main-content" className="sol-main memory-handoff">
      <Link href={`/circles/${circle.id}`} className="sol-text-link">← Back to {circle.title}</Link>
      <p className="sol-eyebrow">SAMPLE MEMORY</p>
      <h1>{memory.title}</h1>
      <p>The memory details screen is coming in the next frontend pass. This sample is not connected to saved memories yet.</p>
    </main>
  );
}
