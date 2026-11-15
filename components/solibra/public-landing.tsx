import Link from 'next/link';
import { ArrowRight, BookOpen, Sparkles } from 'lucide-react';
import { BrandLogo } from './brand-logo';
import { SolibraEmote } from './solibra-emote';
import { NookWindow } from './nook-window';
import { sampleCircles } from '@/lib/fixtures/library';

const features = [
  { title: 'Create your own Nook', text: 'A private corner for family, friends, or anyone you want to collect memories with.', emote: 'wave' },
  { title: 'Collect the little moments', text: 'Save photographs, letters, and written stories in one shared place.', emote: 'reading' },
  { title: 'Everyone has a perspective', text: 'Invite others to add their own recollections to meaningful memories.', emote: 'announce' },
  { title: 'Keep the conversation going', text: 'Exchange messages within a Nook and revisit memories together.', emote: 'celebrate' }
] as const;

/** Public copy and official artwork only. No account data or private reads. */
export function PublicLanding() {
  return <main id="main-content" className="public-landing">
    <section className="landing-hero"><BrandLogo/><p className="sol-eyebrow">A home for your shared stories</p><h1>A little library.<br/><em>A lifetime together.</em></h1><p className="landing-intro">Solibra is a private space to collect the memories, stories, and voices that bring your people together.</p><div className="landing-actions"><div className="landing-auth-actions"><Link className="sol-button" href="/sign-up">Create an Account <ArrowRight size={18}/></Link><Link className="sol-outline-button" href="/sign-in">Sign In</Link></div><Link className="landing-demo-link" href="/demo">Explore Demo Library <BookOpen size={18}/></Link></div><div className="landing-keepsake" aria-hidden="true"><span>A photograph.</span><Sparkles size={20}/><span>A familiar voice.</span><Sparkles size={20}/><span>A story worth keeping.</span></div></section>
    <section className="landing-features" aria-labelledby="landing-features-title"><p className="sol-eyebrow">Made for the people who matter</p><h2 id="landing-features-title">Little moments belong together.</h2><div className="landing-feature-grid">{features.map(feature => <article className="landing-feature" key={feature.title}><SolibraEmote variant={feature.emote} size="clamp(76px,10vw,116px)"/><div><h3>{feature.title}</h3><p>{feature.text}</p></div></article>)}</div></section>
    <section className="landing-demo"><NookWindow circle={sampleCircles[0]} publicPreview /><div><p className="sol-eyebrow">Come have a look around</p><h2>A little peek inside.</h2><p>Step into our demo Library and see how memories find a home. The people and memories here are fictional samples, ready for you to explore.</p><Link className="sol-button" href="/demo">Explore Demo Library <ArrowRight size={18}/></Link></div></section>
  </main>;
}
