import { NOOK_DOOR_COLORS } from './nook-colors';

/** Presentation only. Shared by full books and miniature window spines. */
export function memoryBookAppearance(artifactId: number) {
  const hash = Math.imul(artifactId, 2654435761) >>> 0;
  return { color: NOOK_DOOR_COLORS[hash % NOOK_DOOR_COLORS.length], height: 208 + ((hash >>> 8) % 4) * 12 };
}
