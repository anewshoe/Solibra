import { z } from 'zod';

// Browser-safe contract: no database or server-only imports.
export const nookRoleSchema = z.enum(['owner', 'member']);
export type NookRole = z.infer<typeof nookRoleSchema>;
export const createNookSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).nullable().optional()
}).strict();
export const updateNookSchema = createNookSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'Provide at least one Nook detail to update.'
);
export const inviteNookMemberSchema = z.object({
  email: z.string().trim().email().max(255),
  role: nookRoleSchema.default('member')
}).strict();
export const updateNookMemberSchema = z.object({ role: nookRoleSchema }).strict();

export type CreateNookRequest = z.input<typeof createNookSchema>;
export type UpdateNookRequest = z.input<typeof updateNookSchema>;
export type InviteNookMemberRequest = z.input<typeof inviteNookMemberSchema>;
export type UpdateNookMemberRequest = z.input<typeof updateNookMemberSchema>;

export interface Nook {
  id: number;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  role: NookRole;
}
export interface NookMembership {
  id: number;
  nookId: number;
  userId: number;
  role: NookRole;
  joinedAt: string;
  user: { id: number; name: string | null; email: string; avatarUrl?: string | null };
}
export interface NookInvitation {
  id: number;
  nookId: number;
  email: string;
  role: NookRole;
  invitedBy: number;
  invitedAt: string;
  status: 'pending' | 'accepted' | 'revoked';
}
export type NookErrorCode =
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'NOT_FOUND'
  | 'INVALID_REQUEST' | 'CONFLICT' | 'INTERNAL_ERROR';
export interface NookErrorResponse {
  error: { code: NookErrorCode; message: string };
}
export interface NookResponse { nook: Nook }
export interface NookListResponse { nooks: Nook[] }
export interface NookMembershipListResponse { members: NookMembership[] }
export interface NookInvitationResponse { invitation: NookInvitation }
export interface NookInvitationListResponse { invitations: NookInvitation[] }
export interface AcceptNookInvitationResponse { nookId: number }
export interface NookSuccessResponse { success: true }
