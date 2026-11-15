'use client';

import Link from 'next/link';
import type { MemoryCategory, SampleCircle } from '@/lib/fixtures/library';

export function Bookshelf(props: { circle: SampleCircle; onFilter: (category: MemoryCategory) => void } | { nookName:string; children:React.ReactNode }) {
  if ('nookName' in props) return <section className="sol-bookshelf-section" aria-label="Nook bookshelf"><h2 className="mobile-shelf-title">On your shelf</h2><div className="sol-bookshelf real-bookshelf">{props.children}<div className="shelf-plank"/><p className="shelf-label">{props.nookName} · A home for your shared stories</p></div></section>;
  const { circle, onFilter } = props;
  return (
    <section className="sol-bookshelf-section" aria-label="Nook bookshelf">
      <h2 className="mobile-shelf-title">On your {circle.collection === 'family' ? 'family' : circle.collection} shelf</h2>
      <div className="sol-bookshelf">
        <div className="shelf-artifacts">
          <button className="shelf-book book-sunday" onClick={() => onFilter('photo')}><span className="book-imprint">SOLIBRA</span><span className="book-title">Sunday<br />stories</span><span className="book-caption">8 memories</span></button>
          <button className="shelf-book book-home" onClick={() => onFilter('photo')}><span className="book-imprint">SOLIBRA</span><span className="book-title">Our first<br />home</span><span className="book-caption">1978–1992</span></button>
          <Link href={`/circles/${circle.id}/memories/sundays-in-her-kitchen`} className="shelf-photo shelf-photo-family"><img src="/solibra/kitchen-memory.png" alt="A grandmother and child making tortillas together" /><span>Sundays in<br />her kitchen</span><small>ELENA · 1986</small></Link>
          <button className="shelf-book book-recipes" onClick={() => onFilter('recipe')}><span className="book-imprint">SOLIBRA</span><span className="book-title">Recipes<br />we love</span><span className="book-caption">12 recipes</span></button>
          <button className="shelf-book book-voice" onClick={() => onFilter('voice')}><span className="book-imprint">SOLIBRA</span><span className="book-title">Abuelo’s<br />voice</span><span className="book-caption">6 recordings</span></button>
          <Link href={`/circles/${circle.id}/memories/abuelas-tortilla-recipe`} className="shelf-photo shelf-photo-recipe"><img src="/solibra/tortilla-memory.png" alt="A handwritten family recipe and ingredients" /><span>From our<br />kitchen</span><small>3 voices</small></Link>
        </div>
        <div className="shelf-plank" />
        <p className="shelf-label">THE {circle.collection.toUpperCase()} SHELF <span>/</span> A little of where we come from</p>
      </div>
    </section>
  );
}
