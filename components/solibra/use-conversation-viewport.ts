'use client';

import { useEffect, type RefObject } from 'react';

// The real visual viewport shrinks or pans when a mobile keyboard opens.
// Keep the composer in that viewport; never render Figma's example keyboard.
export function useConversationViewport(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = ref.current?.closest<HTMLElement>('.solibra');
    if (!root) return;
    const viewport = window.visualViewport;
    let baseline = Math.max(window.innerHeight, viewport?.height || 0);
    let width = window.innerWidth;
    function update() {
      if (!root) return;
      if (Math.abs(window.innerWidth - width) > 80) { baseline = window.innerHeight; width = window.innerWidth; }
      const height = viewport?.height || window.innerHeight;
      baseline = Math.max(baseline, window.innerHeight, height);
      const editing = document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement;
      const keyboard = editing && baseline - height > 120;
      root.style.setProperty('--sol-visual-height', `${height}px`);
      root.style.setProperty('--sol-visual-top', `${viewport?.offsetTop || 0}px`);
      root.dataset.keyboard = keyboard ? 'open' : 'closed';
    }
    update();
    viewport?.addEventListener('resize', update); viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update); document.addEventListener('focusin', update); document.addEventListener('focusout', update);
    return () => {
      viewport?.removeEventListener('resize', update); viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update); document.removeEventListener('focusin', update); document.removeEventListener('focusout', update);
      root.style.removeProperty('--sol-visual-height'); root.style.removeProperty('--sol-visual-top'); delete root.dataset.keyboard;
    };
  }, [ref]);
}
