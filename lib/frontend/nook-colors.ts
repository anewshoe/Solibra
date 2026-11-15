// Presentation only: not part of CreateNookRequest or persisted by the API.
export const NOOK_DOOR_COLORS = ['pink', 'lilac', 'blue', 'green', 'yellow'] as const;
export type NookDoorColor = typeof NOOK_DOOR_COLORS[number];
export function creationTransitionMs(reducedMotion: boolean) { return reducedMotion ? 0 : 500; }
