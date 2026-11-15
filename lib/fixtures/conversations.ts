import { sampleCircles, sampleMemories, type SampleMemory } from './library';

export type MemberId = 'sofia' | 'elena' | 'mateo' | 'mama';
export type ThreadId = 'elena' | 'family' | 'mama';
export const members = {
  sofia: { name: 'Sofía', image: '/solibra/sofia.png' },
  elena: { name: 'Elena', image: '/solibra/elena.png' },
  mateo: { name: 'Mateo', image: '/solibra/mateo.png' },
  mama: { name: 'Mamá', image: '/solibra/sofia.png' }
} satisfies Record<MemberId, { name: string; image: string }>;

export const threads: { id: ThreadId; name: string; memberId: MemberId; preview: string }[] = [
  { id: 'elena', name: 'Abuela Elena', memberId: 'elena', preview: 'Sent you a voice story' },
  { id: 'family', name: 'The Rivera family', memberId: 'mateo', preview: 'Mateo: I remember this!' },
  { id: 'mama', name: 'Mamá', memberId: 'mama', preview: 'Thank you, mi amor.' }
];

export interface Artifact extends SampleMemory {
  artifactId: string;
  caption: string;
  metadata: string;
  storyHeading: string;
  story: string;
}

export const PRIMARY_ARTIFACT_ID = 'sundays-in-her-kitchen';

// The first-pass audio card is a contribution to the kitchen photograph,
// rather than a second, unrelated artifact. Keep its old URL as an alias.
export function canonicalArtifactId(memoryId: string): string {
  return memoryId === 'elenas-original-story' ? PRIMARY_ARTIFACT_ID : memoryId;
}

export function memoryHref(circleId: string, artifactId: string, contributionId?: string): string {
  const path = `/circles/${encodeURIComponent(circleId)}/memories/${encodeURIComponent(canonicalArtifactId(artifactId))}`;
  return contributionId ? `${path}?contribution=${encodeURIComponent(contributionId)}` : path;
}

export function getArtifact(circleId: string, memoryId: string): Artifact | undefined {
  const id = canonicalArtifactId(memoryId);
  const memory = sampleMemories.find((item) => item.circleId === circleId && item.id === id && item.category !== 'voice');
  if (!memory) return;
  return {
    ...memory, artifactId: memory.id,
    caption: id === PRIMARY_ARTIFACT_ID ? 'Elena teaching Sofía the family tortilla recipe, one Sunday at a time.' : 'A handwritten family recipe, kept close and passed down.',
    metadata: id === PRIMARY_ARTIFACT_ID ? 'Oaxaca, México  ·  Summer 1986  ·  Added by Sofía' : 'Family recipe  ·  Added by Sofía',
    storyHeading: id === PRIMARY_ARTIFACT_ID ? 'Some things you never forget.' : 'A little taste of home.',
    story: id === PRIMARY_ARTIFACT_ID
      ? 'The flour on the table. The radio in the corner. The way Abuela knew the dough was ready without ever measuring a thing. A little glimpse into the kitchen we all grew up in.'
      : 'This sample memory holds a family recipe. Add a voice to tell the story behind it, in the language that feels like home.'
  };
}

export interface Contribution {
  contributionId: string;
  circleId: string;
  artifactId: string;
  authorId: MemberId;
  createdAt: string;
  provenance: 'fixture' | 'temporary';
  requestMessageId?: string;
  audioUrl?: string;
  audioBlob?: Blob;
  durationMs: number;
  transcript: string;
  originalLanguage: string;
  translations: Record<string, string>;
}

interface MessageBase {
  messageId: string;
  circleId: string;
  threadId: ThreadId;
  senderId: MemberId;
  createdAt: string;
  provenance: 'fixture' | 'temporary';
}
export type Message = MessageBase & (
  | { kind: 'text'; text: string }
  | { kind: 'artifact'; artifactId: string }
  | { kind: 'request'; artifactId: string; prompt: string; recipientId: MemberId }
  | { kind: 'voice'; artifactId: string; contributionId: string }
);

export const originalContributionId = (circleId: string) => `${circleId}:elena:original-kitchen-story`;
export const replyContributionId = (circleId: string) => `${circleId}:elena:kitchen-reply`;
export const fixtureRequestId = 'rivera-family:elena:sunday-request';

export const fixtureContributions: Contribution[] = sampleCircles.flatMap((circle) => [
  {
    contributionId: originalContributionId(circle.id), circleId: circle.id, artifactId: PRIMARY_ARTIFACT_ID,
    authorId: 'elena', createdAt: '2026-11-14T10:20:00', provenance: 'fixture', durationMs: 102_000,
    transcript: 'Cada domingo, la cocina se llenaba del olor de las tortillas recién hechas. Tu abuelo siempre se robaba la primera.',
    originalLanguage: 'es', translations: { en: 'Every Sunday, the kitchen filled with the smell of freshly made tortillas. Your abuelo always stole the first one.' }
  },
  {
    contributionId: replyContributionId(circle.id), circleId: circle.id, artifactId: PRIMARY_ARTIFACT_ID,
    authorId: 'elena', createdAt: '2026-11-14T10:28:00', provenance: 'fixture', durationMs: 102_000,
    requestMessageId: circle.id === 'rivera-family' ? fixtureRequestId : undefined,
    transcript: 'Tu abuelo siempre se robaba la primera tortilla. Todavía hago una extra para él.',
    originalLanguage: 'es', translations: { en: 'Your abuelo always stole the first tortilla. I still make an extra one for him.' }
  }
]);

const base = { circleId: 'rivera-family', threadId: 'elena' as const, senderId: 'sofia' as const, createdAt: '2026-11-14T10:24:00', provenance: 'fixture' as const };
export const fixtureMessages: Message[] = [
  { ...base, messageId: 'rivera-family:elena:greeting', kind: 'text', text: 'Abuela, what do you remember about Sundays in your kitchen?' },
  { ...base, messageId: 'rivera-family:elena:kitchen-photo', kind: 'artifact', artifactId: PRIMARY_ARTIFACT_ID },
  { ...base, messageId: fixtureRequestId, kind: 'request', artifactId: PRIMARY_ARTIFACT_ID, prompt: 'What made Sundays feel like home?', recipientId: 'elena' },
  { ...base, senderId: 'elena', createdAt: '2026-11-14T10:28:00', messageId: 'rivera-family:elena:voice-reply', kind: 'voice', artifactId: PRIMARY_ARTIFACT_ID, contributionId: replyContributionId('rivera-family') },
  { ...base, threadId: 'family', senderId: 'mateo', messageId: 'rivera-family:family:greeting', kind: 'text', text: 'I remember this!' },
  { ...base, threadId: 'mama', senderId: 'mama', messageId: 'rivera-family:mama:greeting', kind: 'text', text: 'Thank you, mi amor.' }
];
