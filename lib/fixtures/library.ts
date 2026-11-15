// Frontend fixtures only: no requests, persistence, or database model assumptions.
// Keep circleId and /circles resource names when replacing these with real data.
export type Collection = 'family' | 'kitchen' | 'adventures';
export type MemoryCategory = 'photo' | 'recipe' | 'voice';

export interface SampleCircle {
  id: string;
  title: string;
  description: string;
  collection: Collection;
  memoryCount: number;
  participantCount: number;
  sharedWithMe: boolean;
  lastVisited: string;
}

export interface SampleMemory {
  id: string;
  circleId: string;
  title: string;
  category: MemoryCategory;
  image?: string;
  imageAlt?: string;
  voices: number;
  contributors: string;
  createdAt: string;
  audioSrc?: string;
}

export const sampleCircles: SampleCircle[] = [
  { id: 'rivera-family', title: 'The Rivera family', description: 'From Oaxaca Sundays to our newest traditions, the Rivera family’s stories live here.', collection: 'family', memoryCount: 38, participantCount: 6, sharedWithMe: false, lastVisited: '2026-11-14' },
  { id: 'abuelas-kitchen', title: 'Abuela’s kitchen', description: 'Abuela’s handwritten recipes, tortilla lessons, and the voices around her kitchen table.', collection: 'kitchen', memoryCount: 12, participantCount: 4, sharedWithMe: true, lastVisited: '2026-11-12' },
  { id: 'little-adventures', title: 'Our little adventures', description: 'Road trips, seaside walks, and the little discoveries we bring home together.', collection: 'adventures', memoryCount: 24, participantCount: 3, sharedWithMe: false, lastVisited: '2026-11-13' }
];

const familyMemories: SampleMemory[] = [
  { id: 'sundays-in-her-kitchen', circleId: 'rivera-family', title: 'Sundays in her kitchen', category: 'photo', image: '/solibra/kitchen-memory.png', imageAlt: 'A grandmother and child making tortillas together in a warm family kitchen', voices: 2, contributors: 'Elena, Sofía + Mateo', createdAt: '2026-11-14' },
  { id: 'abuelas-tortilla-recipe', circleId: 'rivera-family', title: 'Abuela’s tortilla recipe', category: 'recipe', image: '/solibra/tortilla-memory.png', imageAlt: 'A handwritten family tortilla recipe beside bowls of flour and ingredients', voices: 3, contributors: 'Elena, Sofía + Mateo', createdAt: '2026-11-13' },
  { id: 'elenas-original-story', circleId: 'rivera-family', title: 'Elena’s original story', category: 'voice', voices: 1, contributors: 'Elena', createdAt: '2026-11-12' }
];

// Reuse the Figma preview memories for each demo Nook, scoped to its resource ID.
export const sampleMemories: SampleMemory[] = sampleCircles.flatMap((circle) =>
  familyMemories.map((memory) => ({ ...memory, circleId: circle.id }))
);

export const sampleMembers = [
  { name: 'Elena', image: '/solibra/elena.png' },
  { name: 'Sofía', image: '/solibra/sofia.png' },
  { name: 'Mateo', image: '/solibra/mateo.png' }
];
