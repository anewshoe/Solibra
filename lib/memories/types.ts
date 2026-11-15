import { z } from 'zod';
import type { NookErrorResponse } from '@/lib/nooks/types';

// Browser-safe request schemas and JSON contracts; no ORM/server imports.
export const artifactTypeSchema = z.enum(['photo', 'audio', 'letter', 'text', 'other']);
export const processingStatusSchema = z.enum(['draft', 'pending', 'processing', 'completed', 'failed']);
export type ArtifactType = z.infer<typeof artifactTypeSchema>;
export type ProcessingStatus = z.infer<typeof processingStatusSchema>;

export const createArtifactSchema = z.object({
  type: artifactTypeSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(10_000).nullable().optional()
}).strict();

// Audio creation makes a draft only. Media and provider outputs are server-managed.
export const createContributionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text'), content: z.string().trim().min(1).max(20_000) }).strict(),
  z.object({ type: z.literal('audio') }).strict()
]);
export const createMessageSchema = z.object({
  type: z.enum(['text', 'audio']).optional(),
  content: z.string().trim().max(5_000).optional(),
  artifactId: z.number().int().positive().max(2_147_483_647).nullable().optional()
}).strict().refine(value => value.type === 'audio' || !!value.content, 'Text messages need content.');

export type CreateArtifactRequest = z.input<typeof createArtifactSchema>;
export type CreateContributionRequest = z.input<typeof createContributionSchema>;
export type CreateMessageRequest = z.input<typeof createMessageSchema>;
export type MemoryErrorResponse = NookErrorResponse;

export interface Artifact {
  id: number;
  nookId: number;
  creatorId: number;
  type: ArtifactType;
  title: string;
  description: string | null;
  mediaStorageKey: string | null;
  createdAt: string;
  updatedAt: string;
}
export interface Contribution {
  id: number;
  artifactId: number;
  authorId: number;
  type: 'text' | 'audio';
  content: string | null;
  audioStorageKey: string | null;
  originalTranscript: string | null;
  sourceLanguage: string | null;
  processingStatus: ProcessingStatus | null;
  createdAt: string;
  updatedAt: string;
}
export interface Message {
  id: number;
  nookId: number;
  senderId: number;
  content: string;
  artifactId: number | null;
  createdAt: string;
  type?: 'text' | 'audio';
  audioUrl?: string | null;
  originalTranscript?: string | null;
  sourceLanguage?: string | null;
  processingStatus?: ProcessingStatus | null;
  updatedAt?: string;
}
export interface ArtifactResponse { artifact: Artifact }
export interface ArtifactListResponse { artifacts: Artifact[] }
export interface ContributionResponse { contribution: Contribution }
export interface ContributionListResponse { contributions: Contribution[] }
export interface MessageResponse { message: Message }
export interface MessageListResponse { messages: Message[] }
