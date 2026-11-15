import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { RecentAddition } from '@/lib/fixtures/recent-additions';
import { memoryHref } from '@/lib/fixtures/conversations';
import { SolibraEmote } from './solibra-emote';

export function RecentAdditions({ entries }: { entries: RecentAddition[] }) {
  return <section className="recent-additions" aria-label="Recent Additions">
    <div className="recent-additions-heading library-section-heading"><SolibraEmote variant="reading" size={64}/><h2>Recent Additions</h2><span>Sample activity</span></div>
    {entries.length ? entries.map((entry) => <article className="recent-addition" key={entry.id}>
      <div className="recent-addition-copy"><p className="sol-eyebrow">{entry.nookName}</p><p>{entry.activity}</p></div>
      <Link className="sol-text-link" href={memoryHref(entry.circleId, entry.artifactId)}>View memory <ArrowRight size={16} /></Link>
    </article>) : <p>No recent additions yet.</p>}
  </section>;
}
