import 'server-only';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, artifacts, contributions, messages, teams } from '@/lib/db/schema';
import { requireNookMembership } from '@/lib/nooks/service';
import { NookError } from '@/lib/nooks/errors';
import type {
  Artifact, Contribution, Message, CreateArtifactRequest,
  CreateContributionRequest, CreateMessageRequest
} from './types';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type ArtifactRow = typeof artifacts.$inferSelect;
type ContributionRow = typeof contributions.$inferSelect;
type MessageRow = typeof messages.$inferSelect;

const artifactJson = (row: ArtifactRow): Artifact => ({
  ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
});
const contributionJson = (row: ContributionRow): Contribution => ({
  ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString()
});
const messageJson = (row: MessageRow): Message => ({ ...row, createdAt: row.createdAt.toISOString() });

async function inNook<T>(userId: number, nookId: number, operation: (tx: Transaction) => Promise<T>) {
  return db.transaction(async (tx) => {
    // Membership management locks this same row FOR UPDATE. A shared lock keeps
    // membership valid for the entire operation while allowing concurrent reads.
    const [nook] = await tx.select({ id: teams.id }).from(teams)
      .where(eq(teams.id, nookId)).for('share');
    if (!nook) throw new NookError(404, 'NOT_FOUND', 'Nook not found.');
    await requireNookMembership(tx, userId, nookId);
    return operation(tx);
  });
}
async function requireArtifact(tx: Transaction, nookId: number, artifactId: number) {
  const [row] = await tx.select().from(artifacts)
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.nookId, nookId))).limit(1);
  if (!row) throw new NookError(404, 'NOT_FOUND', 'Nook artifact not found.');
  return row;
}

export async function createArtifact(userId: number, nookId: number, data: CreateArtifactRequest) {
  return inNook(userId, nookId, async (tx) => {
    const [row] = await tx.insert(artifacts).values({
      nookId, creatorId: userId, type: data.type,
      title: data.title, description: data.description ?? null
    }).returning();
    await tx.insert(activityLogs).values({ teamId: nookId, userId, action: 'CREATE_ARTIFACT' });
    return artifactJson(row);
  });
}
export async function listArtifacts(userId: number, nookId: number) {
  return inNook(userId, nookId, async (tx) => {
    const rows = await tx.select().from(artifacts).where(eq(artifacts.nookId, nookId))
      .orderBy(asc(artifacts.createdAt), asc(artifacts.id));
    return rows.map(artifactJson);
  });
}
export async function getArtifact(userId: number, nookId: number, artifactId: number) {
  return inNook(userId, nookId, async (tx) => artifactJson(await requireArtifact(tx, nookId, artifactId)));
}
export async function createContribution(
  userId: number, nookId: number, artifactId: number, data: CreateContributionRequest
) {
  return inNook(userId, nookId, async (tx) => {
    await requireArtifact(tx, nookId, artifactId);
    const [row] = await tx.insert(contributions).values({
      artifactId, authorId: userId, type: data.type,
      content: data.type === 'text' ? data.content : null,
      processingStatus: data.type === 'audio' ? 'draft' : null
    }).returning();
    await tx.insert(activityLogs).values({ teamId: nookId, userId, action: 'SUBMIT_CONTRIBUTION' });
    return contributionJson(row);
  });
}
export async function listContributions(userId: number, nookId: number, artifactId: number) {
  return inNook(userId, nookId, async (tx) => {
    await requireArtifact(tx, nookId, artifactId);
    const rows = await tx.select().from(contributions).where(eq(contributions.artifactId, artifactId))
      .orderBy(asc(contributions.createdAt), asc(contributions.id));
    return rows.map(contributionJson);
  });
}
export async function getContribution(userId: number, nookId: number, artifactId: number, contributionId: number) {
  return inNook(userId, nookId, async (tx) => {
    await requireArtifact(tx, nookId, artifactId);
    const [row] = await tx.select().from(contributions).where(and(
      eq(contributions.id, contributionId), eq(contributions.artifactId, artifactId)
    )).limit(1);
    if (!row) throw new NookError(404, 'NOT_FOUND', 'Nook contribution not found.');
    return contributionJson(row);
  });
}
export async function createMessage(userId: number, nookId: number, data: CreateMessageRequest) {
  return inNook(userId, nookId, async (tx) => {
    if (data.artifactId != null) await requireArtifact(tx, nookId, data.artifactId);
    const [row] = await tx.insert(messages).values({
      nookId, senderId: userId, content: data.content, artifactId: data.artifactId ?? null
    }).returning();
    return messageJson(row);
  });
}
export async function listMessages(userId: number, nookId: number) {
  return inNook(userId, nookId, async (tx) => {
    const rows = await tx.select().from(messages).where(eq(messages.nookId, nookId))
      .orderBy(asc(messages.createdAt), asc(messages.id));
    return rows.map(messageJson);
  });
}
