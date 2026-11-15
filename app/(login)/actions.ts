'use server';

import { z } from 'zod';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  User,
  users,
  teams,
  teamMembers,
  activityLogs,
  type NewActivityLog,
  ActivityType,
  invitations
} from '@/lib/db/schema';
import { comparePasswords, hashPassword, setSession } from '@/lib/auth/session';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getUser, getUserWithTeam } from '@/lib/db/queries';
import {
  acceptNookInvitationInTransaction, createNookInTransaction,
  inviteNookMember, manageNookMember
} from '@/lib/nooks/service';
import { NookError } from '@/lib/nooks/errors';
import {
  validatedAction,
  validatedActionWithUser
} from '@/lib/auth/middleware';

async function logActivity(
  teamId: number | null | undefined,
  userId: number,
  type: ActivityType,
  ipAddress?: string
) {
  if (teamId === null || teamId === undefined) {
    return;
  }
  const newActivity: NewActivityLog = {
    teamId,
    userId,
    action: type,
    ipAddress: ipAddress || ''
  };
  await db.insert(activityLogs).values(newActivity);
}

const signInSchema = z.object({
  email: z.string().email().min(3).max(255),
  password: z.string().min(8).max(100)
});

export const signIn = validatedAction(signInSchema, async (data) => {
  const { email, password } = data;

  const userWithTeam = await db
    .select({
      user: users,
      team: teams
    })
    .from(users)
    .leftJoin(teamMembers, eq(users.id, teamMembers.userId))
    .leftJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1);

  if (userWithTeam.length === 0) {
    return {
      error: 'Invalid email or password. Please try again.',
      email
    };
  }

  const { user: foundUser, team: foundTeam } = userWithTeam[0];

  const isPasswordValid = await comparePasswords(
    password,
    foundUser.passwordHash
  );

  if (!isPasswordValid) {
    return {
      error: 'Invalid email or password. Please try again.',
      email
    };
  }

  await Promise.all([
    setSession(foundUser),
    logActivity(foundTeam?.id, foundUser.id, ActivityType.SIGN_IN)
  ]);

  redirect('/');
});

const signUpSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
  inviteId: z.preprocess(
    (value) => value === '' ? undefined : value,
    z.string().regex(/^[1-9]\d*$/, 'Invalid Nook invitation ID.').optional()
  )
});

export const signUp = validatedAction(signUpSchema, async (data) => {
  const { email, password, inviteId } = data;
  const passwordHash = await hashPassword(password);
  let createdUser: User;
  try {
    createdUser = await db.transaction(async (tx) => {
      // A failed invitation rolls back the account as well as membership changes.
      const invitationId = inviteId ? Number(inviteId) : undefined;
      if (invitationId !== undefined && !Number.isSafeInteger(invitationId)) {
        throw new NookError(400, 'INVALID_REQUEST', 'Invalid Nook invitation ID.');
      }
      const [pendingInvitation] = invitationId ? await tx.select().from(invitations)
        .where(and(eq(invitations.id, invitationId), eq(invitations.status, 'pending'))).limit(1) : [];
      if (invitationId && (!pendingInvitation || pendingInvitation.email.toLowerCase() !== email.toLowerCase())) {
        throw new NookError(404, 'NOT_FOUND', 'Nook invitation not found.');
      }
      const [user] = await tx.insert(users).values({
        email, passwordHash, role: pendingInvitation?.role ?? 'owner'
      }).returning();
      let nookId: number;
      if (pendingInvitation) {
        ({ nookId } = await acceptNookInvitationInTransaction(tx, user.id, pendingInvitation.teamId, pendingInvitation.id));
      } else {
        const nook = await createNookInTransaction(tx, user.id, { name: email.slice(0, 93) + "'s Nook" });
        nookId = nook.id;
      }
      await tx.insert(activityLogs).values({ teamId: nookId, userId: user.id, action: ActivityType.SIGN_UP });
      return user;
    });
  } catch (error) {
    if (error instanceof NookError) return { error: error.message, email };
    // Drizzle may wrap the PostgreSQL unique-constraint error in a cause.
    const cause = error as { code?: string; cause?: { code?: string } };
    if (cause.code === '23505' || cause.cause?.code === '23505') {
      return { error: 'Unable to create this account. Try signing in instead.', email };
    }
    throw error;
  }
  await setSession(createdUser);
  redirect('/profile/setup');
});

export async function signOut() {
  const user = await getUser();
  if (user) {
    const userWithTeam = await getUserWithTeam(user.id);
    await logActivity(userWithTeam?.teamId, user.id, ActivityType.SIGN_OUT);
  }
  (await cookies()).delete('session');
}

const updatePasswordSchema = z.object({
  currentPassword: z.string().min(8).max(100),
  newPassword: z.string().min(8).max(100),
  confirmPassword: z.string().min(8).max(100)
});

export const updatePassword = validatedActionWithUser(
  updatePasswordSchema,
  async (data, _, user) => {
    const { currentPassword, newPassword, confirmPassword } = data;

    const isPasswordValid = await comparePasswords(
      currentPassword,
      user.passwordHash
    );

    if (!isPasswordValid) {
      return {
        error: 'Current password is incorrect.'
      };
    }

    if (currentPassword === newPassword) {
      return {
        error: 'New password must be different from the current password.'
      };
    }

    if (confirmPassword !== newPassword) {
      return {
        error: 'New password and confirmation password do not match.'
      };
    }

    const newPasswordHash = await hashPassword(newPassword);
    const userWithTeam = await getUserWithTeam(user.id);

    await Promise.all([
      db
        .update(users)
        .set({ passwordHash: newPasswordHash })
        .where(eq(users.id, user.id)),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_PASSWORD)
    ]);

    return {
      success: 'Password updated successfully.'
    };
  }
);

const deleteAccountSchema = z.object({
  password: z.string().min(8).max(100)
});

export const deleteAccount = validatedActionWithUser(
  deleteAccountSchema,
  async (data, _, user) => {
    const { password } = data;

    const isPasswordValid = await comparePasswords(password, user.passwordHash);
    if (!isPasswordValid) {
      return {
        error: 'Incorrect password. Account deletion failed.'
      };
    }

    try {
      await db.transaction(async (tx) => {
        // Lock all Nooks in a stable order before changing this user's memberships.
        const memberships = await tx.select({ nookId: teams.id }).from(teams)
          .innerJoin(teamMembers, eq(teamMembers.teamId, teams.id))
          .where(eq(teamMembers.userId, user.id)).orderBy(asc(teams.id))
          .for('update', { of: teams });
        for (const nookId of new Set(memberships.map((m) => m.nookId))) {
          const owners = await tx.select({ userId: teamMembers.userId }).from(teamMembers)
            .innerJoin(users, eq(users.id, teamMembers.userId)).where(and(
              eq(teamMembers.teamId, nookId), eq(teamMembers.role, 'owner'), isNull(users.deletedAt)
            ));
          if (owners.some((owner) => owner.userId === user.id) &&
              !owners.some((owner) => owner.userId !== user.id)) {
            throw new NookError(409, 'CONFLICT', 'Transfer Nook ownership before deleting your account.');
          }
          await tx.insert(activityLogs).values({ teamId: nookId, userId: user.id, action: ActivityType.DELETE_ACCOUNT });
        }
        await tx.update(users).set({
          deletedAt: sql`CURRENT_TIMESTAMP`,
          email: sql`CONCAT(email, '-', id, '-deleted')`
        }).where(eq(users.id, user.id));
        await tx.delete(teamMembers).where(eq(teamMembers.userId, user.id));
      });
    } catch (error) {
      if (error instanceof NookError) return { error: error.message };
      throw error;
    }

    (await cookies()).delete('session');
    redirect('/sign-in');
  }
);

const updateAccountSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address')
});

export const updateAccount = validatedActionWithUser(
  updateAccountSchema,
  async (data, _, user) => {
    const { name, email } = data;
    const userWithTeam = await getUserWithTeam(user.id);

    await Promise.all([
      db.update(users).set({ name, email }).where(eq(users.id, user.id)),
      logActivity(userWithTeam?.teamId, user.id, ActivityType.UPDATE_ACCOUNT)
    ]);

    return { name, success: 'Account updated successfully.' };
  }
);

const removeTeamMemberSchema = z.object({
  memberId: z.coerce.number().int().positive().safe()
});

export const removeTeamMember = validatedActionWithUser(
  removeTeamMemberSchema,
  async (data, _, user) => {
    const current = await getUserWithTeam(user.id);
    if (!current?.teamId) return { error: 'Nook not found.' };
    try {
      await manageNookMember(user.id, current.teamId, data.memberId);
      return { success: 'Nook member removed successfully.' };
    } catch (error) {
      if (error instanceof NookError) return { error: error.message };
      throw error;
    }
  }
);

const inviteTeamMemberSchema = z.object({
  email: z.string().trim().email('Invalid email address').max(255),
  role: z.enum(['member', 'owner'])
});

export const inviteTeamMember = validatedActionWithUser(
  inviteTeamMemberSchema,
  async (data, _, user) => {
    const current = await getUserWithTeam(user.id);
    if (!current?.teamId) return { error: 'Nook not found.' };
    try {
      await inviteNookMember(user.id, current.teamId, data.email, data.role);
      return { success: 'Nook invitation created successfully.' };
    } catch (error) {
      if (error instanceof NookError) return { error: error.message };
      throw error;
    }
  }
);
