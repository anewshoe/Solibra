import 'server-only';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { db } from '@/lib/db/drizzle';
import { users, teamMembers, teams } from '@/lib/db/schema';
import { storage, UPLOAD_SECONDS } from '@/lib/media/storage';
import { matchesMediaSignature } from '@/lib/media/validation';
import { NookError } from '@/lib/nooks/errors';
import { avatarUploadSchema, avatarUrl } from './types';
import type { AvatarResult, AvatarUploadResponse } from './types';
import { readAvatarTicket, signAvatarTicket } from './tickets';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' } as const;
const version = (row: typeof users.$inferSelect) => new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
function validKey(userId: number, key: string, staging = false) {
  const prefix = `users/${userId}/avatars/${staging ? 'staging' : 'objects'}/`;
  return key.startsWith(prefix) && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(key.slice(prefix.length));
}
async function safe<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (error) {
    if (error instanceof NookError) throw error;
    // Never pass SQL parameters, signed policies, or SDK errors to route logs.
    throw new NookError(503, 'INTERNAL_ERROR', 'Profile photo service is unavailable. Refresh your profile before retrying.');
  }
}
async function account(tx: Transaction, userId: number) {
  const [row] = await tx.select().from(users).where(and(eq(users.id, userId), isNull(users.deletedAt))).for('update');
  if (!row) throw new NookError(404, 'NOT_FOUND', 'Account not found.');
  if (row.avatarStorageKey && !validKey(userId, row.avatarStorageKey)) throw new NookError(409, 'CONFLICT', 'Profile photo reference is invalid.');
  return row;
}
async function remove(key: string) {
  try { await storage.remove(key); return true; } catch { return false; }
}
async function verify(key: string, type: string, size: number) {
  const meta = await storage.head(key);
  if (meta.byteSize !== size || meta.contentType !== type) throw new NookError(415, 'INVALID_REQUEST', 'Profile photo metadata does not match the upload.');
  const reader = (await storage.get(key, 'bytes=0-31')).getReader();
  const bytes = new Uint8Array(32); let count = 0;
  const timeout = setTimeout(() => { void reader.cancel().catch(() => {}); }, 15_000);
  try {
    while (count < bytes.length) {
      const { done, value } = await reader.read(); if (done) break;
      const length = Math.min(value.length, bytes.length - count);
      bytes.set(value.subarray(0, length), count); count += length;
    }
    if (!matchesMediaSignature(bytes.subarray(0, count), type)) throw new NookError(415, 'INVALID_REQUEST', 'Profile photo contents do not match the image type.');
  } finally { clearTimeout(timeout); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
export async function initiateAvatar(userId: number, input: unknown): Promise<AvatarUploadResponse> {
  return safe(async () => {
    const parsed = avatarUploadSchema.safeParse(input);
    if (!parsed.success) throw new NookError(400, 'INVALID_REQUEST', 'Choose a JPEG, PNG or WebP image between 16 and 2,000,000 bytes.');
    const data = parsed.data;
    return db.transaction(async tx => {
      const row = await account(tx, userId);
      const stagingKey = `users/${userId}/avatars/staging/${randomUUID()}.${extensions[data.contentType]}`;
      const uploadToken = await signAvatarTicket({ ...data, userId, stagingKey, previousKey: row.avatarStorageKey, version: row.updatedAt.toISOString() });
      const signed = await storage.signUpload(stagingKey, data.contentType, data.byteSize);
      return { upload: { ...signed, ...data, method: 'POST', uploadToken, expiresAt: new Date(Date.now() + UPLOAD_SECONDS * 1000).toISOString() } };
    });
  });
}
export async function completeAvatar(userId: number, token: string): Promise<AvatarResult> {
  return safe(async () => {
    const ticket = await readAvatarTicket(token);
    if (ticket.userId !== userId || !validKey(userId, ticket.stagingKey, true)) throw new NookError(400, 'INVALID_REQUEST', 'Profile photo authorization belongs to another account.');
    let candidate: string | undefined;
    let oldKey: string | null = null;
    let url: string | null;
    try {
      url = await db.transaction(async tx => {
        const row = await account(tx, userId);
        if (row.avatarStorageKey !== ticket.previousKey || row.updatedAt.toISOString() !== ticket.version) throw new NookError(409, 'CONFLICT', 'Your profile changed. Start a new photo upload.');
        await verify(ticket.stagingKey, ticket.contentType, ticket.byteSize);
        candidate = `users/${userId}/avatars/objects/${randomUUID()}.${extensions[ticket.contentType]}`;
        await storage.copy(ticket.stagingKey, candidate);
        // Immutable server-only snapshot prevents replay of the staging POST from changing the published image.
        await verify(candidate, ticket.contentType, ticket.byteSize);
        oldKey = row.avatarStorageKey;
        const updatedAt = version(row);
        await tx.update(users).set({ avatarStorageKey: candidate, updatedAt }).where(eq(users.id, userId));
        return avatarUrl({ id: userId, avatarStorageKey: candidate, updatedAt });
      });
    } catch (error) {
      // COMMIT acknowledgement may be ambiguous. Keep a candidate unless a fresh read proves it is unreferenced.
      if (candidate) {
        try {
          const [current] = await db.select({ key: users.avatarStorageKey }).from(users).where(eq(users.id, userId));
          if (current && current.key !== candidate) await remove(candidate);
        } catch { /* Retain for manual reconciliation. */ }
      }
      throw error;
    }
    let cleanupPending = !(await remove(ticket.stagingKey));
    if (oldKey && !(await remove(oldKey))) cleanupPending = true;
    return { avatarUrl: url, cleanupPending };
  });
}
export async function deleteAvatar(userId: number): Promise<AvatarResult> {
  return safe(async () => {
    const key = await db.transaction(async tx => {
      const row = await account(tx, userId);
      // Advance the version even when already empty, invalidating outstanding tickets.
      await tx.update(users).set({ avatarStorageKey: null, updatedAt: version(row) }).where(eq(users.id, userId));
      return row.avatarStorageKey;
    });
    return { avatarUrl: null, cleanupPending: key ? !(await remove(key)) : false };
  });
}
export async function retrieveAvatar(viewerId: number, ownerId: number): Promise<Response> {
  return safe(async () => {
    const [owner] = await db.select().from(users).where(and(eq(users.id, ownerId), isNull(users.deletedAt))).limit(1);
    if (!owner) throw new NookError(404, 'NOT_FOUND', 'Profile photo not found.');
    if (viewerId !== ownerId) {
      const viewer = alias(teamMembers, 'avatar_viewer');
      const [shared] = await db.select({ id: teamMembers.id }).from(teamMembers)
        .innerJoin(viewer, eq(viewer.teamId, teamMembers.teamId)).innerJoin(teams, eq(teams.id, teamMembers.teamId))
        .where(and(eq(teamMembers.userId, ownerId), eq(viewer.userId, viewerId),
          inArray(teamMembers.role, ['owner', 'member']), inArray(viewer.role, ['owner', 'member']))).limit(1);
      if (!shared) throw new NookError(404, 'NOT_FOUND', 'Profile photo not found.');
    }
    if (!owner.avatarStorageKey) throw new NookError(404, 'NOT_FOUND', 'Profile photo not found.');
    if (!validKey(ownerId, owner.avatarStorageKey)) throw new NookError(409, 'CONFLICT', 'Profile photo reference is invalid.');
    const meta = await storage.head(owner.avatarStorageKey);
    if (!avatarUploadSchema.safeParse(meta).success) throw new NookError(415, 'INVALID_REQUEST', 'Profile photo metadata is invalid.');
    return new Response(await storage.get(owner.avatarStorageKey), { headers: {
      'Content-Type': meta.contentType, 'Content-Length': String(meta.byteSize),
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Vary': 'Cookie',
      'Content-Disposition': 'inline; filename="profile-photo"', 'Cross-Origin-Resource-Policy': 'same-origin'
    } });
  });
}
