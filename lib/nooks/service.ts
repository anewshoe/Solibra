import 'server-only';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import { activityLogs, invitations, teamMembers, teams, users } from '@/lib/db/schema';
import type { Team, Invitation } from '@/lib/db/schema';
import { NookError } from './errors';
import type {
  Nook, NookInvitation, NookMembership, NookRole,
  CreateNookRequest, UpdateNookRequest
} from './types';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Database = typeof db | Transaction;

function role(value: string): NookRole {
  if (value === 'owner' || value === 'member') return value;
  throw new NookError(403, 'FORBIDDEN', 'This Nook role is not supported.');
}
function nook(row: Team, membershipRole: string): Nook {
  return {
    id: row.id, name: row.name, description: row.description,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    role: role(membershipRole)
  };
}
function invitation(row: Invitation): NookInvitation {
  if (!['pending', 'accepted', 'revoked'].includes(row.status)) {
    throw new NookError(409, 'CONFLICT', 'This Nook invitation is no longer available.');
  }
  return {
    id: row.id, nookId: row.teamId, email: row.email, role: role(row.role),
    invitedBy: row.invitedBy, invitedAt: row.invitedAt.toISOString(),
    status: row.status as NookInvitation['status']
  };
}
async function audit(tx: Transaction, nookId: number, userId: number, action: string) {
  await tx.insert(activityLogs).values({ teamId: nookId, userId, action });
}

// Only trusted server callers supply userId; HTTP bodies never select the actor.
export async function requireNookMembership(
  database: Database, userId: number, nookId: number, ownerOnly = false
) {
  const memberships = await database.select().from(teamMembers).where(and(
    eq(teamMembers.teamId, nookId), eq(teamMembers.userId, userId)
  ));
  // Preserve any historical duplicate membership rows without granting extra access.
  const membership = memberships.find((m) => m.role === 'owner') ?? memberships[0];
  if (!membership) {
    // Use the same response for absent and inaccessible Nooks to avoid enumeration.
    throw new NookError(404, 'NOT_FOUND', 'Nook not found.');
  }
  const membershipRole = role(membership.role);
  if (ownerOnly && membershipRole !== 'owner') {
    throw new NookError(403, 'FORBIDDEN', 'Only a Nook owner may manage this Nook.');
  }
  return membershipRole;
}

async function lockNook(tx: Transaction, nookId: number) {
  const [row] = await tx.select().from(teams).where(eq(teams.id, nookId)).for('update');
  if (!row) throw new NookError(404, 'NOT_FOUND', 'Nook not found.');
  return row;
}

export async function createNookInTransaction(tx: Transaction, userId: number, data: CreateNookRequest) {
  const [row] = await tx.insert(teams).values({
    name: data.name, description: data.description ?? null
  }).returning();
  await tx.insert(teamMembers).values({ teamId: row.id, userId, role: 'owner' });
  await audit(tx, row.id, userId, 'CREATE_NOOK');
  return nook(row, 'owner');
}
export async function createNook(userId: number, data: CreateNookRequest) {
  return db.transaction((tx) => createNookInTransaction(tx, userId, data));
}
export async function listNooks(userId: number): Promise<Nook[]> {
  const rows = await db.select({ nook: teams, role: teamMembers.role }).from(teamMembers)
    .innerJoin(teams, eq(teams.id, teamMembers.teamId))
    .where(eq(teamMembers.userId, userId)).orderBy(asc(teams.id));
  const result = new Map<number, Nook>();
  for (const row of rows) {
    if (!result.has(row.nook.id) || row.role === 'owner') {
      result.set(row.nook.id, nook(row.nook, row.role));
    }
  }
  return [...result.values()];
}
export async function getNook(userId: number, nookId: number) {
  // Check membership and fetch private details in one statement.
  const rows = await db.select({ nook: teams, role: teamMembers.role }).from(teams)
    .innerJoin(teamMembers, eq(teamMembers.teamId, teams.id))
    .where(and(eq(teams.id, nookId), eq(teamMembers.userId, userId)));
  const row = rows.find((r) => r.role === 'owner') ?? rows[0];
  if (!row) throw new NookError(404, 'NOT_FOUND', 'Nook not found.');
  return nook(row.nook, row.role);
}
export async function updateNook(userId: number, nookId: number, data: UpdateNookRequest) {
  return db.transaction(async (tx) => {
    await lockNook(tx, nookId);
    await requireNookMembership(tx, userId, nookId, true);
    const [row] = await tx.update(teams).set({ ...data, updatedAt: new Date() })
      .where(eq(teams.id, nookId)).returning();
    await audit(tx, nookId, userId, 'UPDATE_NOOK');
    return nook(row, 'owner');
  });
}
export async function listNookMembers(userId: number, nookId: number): Promise<NookMembership[]> {
  return db.transaction(async (tx) => {
    // Serialize against membership removal so authorization covers the read.
    await lockNook(tx, nookId);
    await requireNookMembership(tx, userId, nookId);
    const rows = await tx.select({
      id: teamMembers.id, nookId: teamMembers.teamId, userId: teamMembers.userId,
      role: teamMembers.role, joinedAt: teamMembers.joinedAt,
      user: { id: users.id, name: users.name, email: users.email }
    }).from(teamMembers).innerJoin(users, eq(users.id, teamMembers.userId))
      .where(and(eq(teamMembers.teamId, nookId), isNull(users.deletedAt)))
      .orderBy(asc(teamMembers.id));
    return rows.map((row) => ({ ...row, role: role(row.role), joinedAt: row.joinedAt.toISOString() }));
  });
}
export async function inviteNookMember(userId: number, nookId: number, email: string, memberRole: NookRole) {
  return db.transaction(async (tx) => {
    await lockNook(tx, nookId);
    await requireNookMembership(tx, userId, nookId, true);
    const normalizedEmail = email.trim().toLowerCase();
    const [existing] = await tx.select({ id: teamMembers.id }).from(teamMembers)
      .innerJoin(users, eq(users.id, teamMembers.userId))
      .where(and(eq(teamMembers.teamId, nookId), sql`lower(${users.email}) = ${normalizedEmail}`,
        isNull(users.deletedAt))).limit(1);
    if (existing) throw new NookError(409, 'CONFLICT', 'This user is already a Nook member.');
    const [pending] = await tx.select().from(invitations).where(and(
      eq(invitations.teamId, nookId), sql`lower(${invitations.email}) = ${normalizedEmail}`,
      eq(invitations.status, 'pending')
    )).limit(1);
    if (pending) throw new NookError(409, 'CONFLICT', 'A pending Nook invitation already exists.');
    const [row] = await tx.insert(invitations).values({
      teamId: nookId, email: normalizedEmail, role: memberRole, invitedBy: userId
    }).returning();
    await audit(tx, nookId, userId, 'INVITE_NOOK_MEMBER');
    return invitation(row);
  });
}
export async function listNookInvitations(userId: number, nookId: number) {
  return db.transaction(async (tx) => {
    await lockNook(tx, nookId);
    await requireNookMembership(tx, userId, nookId, true);
    const rows = await tx.select().from(invitations).where(eq(invitations.teamId, nookId))
      .orderBy(asc(invitations.id));
    return rows.map(invitation);
  });
}
export async function listMyNookInvitations(userId: number) {
  // The recipient may see invitation metadata, never private Nook details before joining.
  const rows = await db.select({ invitation: invitations }).from(invitations)
    .innerJoin(users, sql`lower(${users.email}) = lower(${invitations.email})`)
    .where(and(eq(users.id, userId), isNull(users.deletedAt), eq(invitations.status, 'pending')))
    .orderBy(asc(invitations.id));
  return rows.map((row) => invitation(row.invitation));
}
export async function acceptNookInvitationInTransaction(
  tx: Transaction, userId: number, nookId: number, invitationId: number
) {
  await lockNook(tx, nookId);
  const [recipient] = await tx.select({ email: users.email }).from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt))).limit(1);
  const [row] = await tx.select().from(invitations).where(and(
    eq(invitations.id, invitationId), eq(invitations.teamId, nookId)
  )).for('update');
  if (!recipient || !row || row.email.toLowerCase() !== recipient.email.toLowerCase()) {
    throw new NookError(404, 'NOT_FOUND', 'Nook invitation not found.');
  }
  if (row.status !== 'pending') {
    throw new NookError(409, 'CONFLICT', 'This Nook invitation is no longer pending.');
  }
  const memberRole = role(row.role);
  const [existing] = await tx.select().from(teamMembers).where(and(
    eq(teamMembers.teamId, nookId), eq(teamMembers.userId, userId)
  )).limit(1);
  // Do not silently promote or demote an existing member through an invitation.
  if (!existing) await tx.insert(teamMembers).values({ teamId: nookId, userId, role: memberRole });
  await tx.update(invitations).set({ status: 'accepted' }).where(eq(invitations.id, invitationId));
  await audit(tx, nookId, userId, 'ACCEPT_NOOK_INVITATION');
  return { nookId };
}
export async function acceptNookInvitation(userId: number, nookId: number, invitationId: number) {
  return db.transaction((tx) => acceptNookInvitationInTransaction(tx, userId, nookId, invitationId));
}
export async function revokeNookInvitation(userId: number, nookId: number, invitationId: number) {
  return db.transaction(async (tx) => {
    await lockNook(tx, nookId);
    await requireNookMembership(tx, userId, nookId, true);
    const [row] = await tx.update(invitations).set({ status: 'revoked' }).where(and(
      eq(invitations.id, invitationId), eq(invitations.teamId, nookId), eq(invitations.status, 'pending')
    )).returning();
    if (!row) throw new NookError(404, 'NOT_FOUND', 'Pending Nook invitation not found.');
    await audit(tx, nookId, userId, 'REVOKE_NOOK_INVITATION');
    return { success: true as const };
  });
}
export async function manageNookMember(
  userId: number, nookId: number, membershipId: number, newRole?: NookRole
) {
  return db.transaction(async (tx) => {
    await lockNook(tx, nookId);
    await requireNookMembership(tx, userId, nookId, true);
    const [target] = await tx.select().from(teamMembers).where(and(
      eq(teamMembers.id, membershipId), eq(teamMembers.teamId, nookId)
    )).limit(1);
    if (!target) throw new NookError(404, 'NOT_FOUND', 'Nook membership not found.');
    if (newRole !== 'owner') {
      const owners = await tx.select({ userId: teamMembers.userId }).from(teamMembers)
        .innerJoin(users, eq(users.id, teamMembers.userId)).where(and(
          eq(teamMembers.teamId, nookId), eq(teamMembers.role, 'owner'), isNull(users.deletedAt)
        ));
      if (owners.some((owner) => owner.userId === target.userId) &&
          !owners.some((owner) => owner.userId !== target.userId)) {
        throw new NookError(409, 'CONFLICT', 'A Nook must retain at least one active owner.');
      }
    }
    if (newRole) {
      // Apply a person's role to historical duplicate rows as well.
      await tx.update(teamMembers).set({ role: newRole }).where(and(
        eq(teamMembers.teamId, nookId), eq(teamMembers.userId, target.userId)
      ));
    } else {
      await tx.delete(teamMembers).where(and(
        eq(teamMembers.teamId, nookId), eq(teamMembers.userId, target.userId)
      ));
    }
    await audit(tx, nookId, userId, newRole ? 'UPDATE_NOOK_MEMBER' : 'REMOVE_NOOK_MEMBER');
    return { success: true as const };
  });
}
