import { z } from 'zod';
import { createNookSchema, inviteNookMemberSchema, nookRoleSchema, type CreateNookRequest, type InviteNookMemberRequest, type NookResponse, type NookInvitationResponse } from '@/lib/nooks/types';

const idSchema = z.number().int().positive().safe();
const nookResponseSchema = z.object({ nook: z.object({ id: idSchema, name: z.string(), description: z.string().nullable(), role: nookRoleSchema, createdAt: z.string(), updatedAt: z.string() }) });
const invitationResponseSchema = z.object({ invitation: z.object({ id: idSchema, nookId: idSchema, email: z.string().email(), role: nookRoleSchema, invitedBy: idSchema, invitedAt: z.string(), status: z.enum(['pending', 'accepted', 'revoked']) }) });
const errorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
export class NookApiError extends Error {
  constructor(message: string, public status: number, public uncertain = false) { super(message); this.name = 'NookApiError'; }
}
async function post(path: string, data: unknown): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data), signal: AbortSignal.timeout(30_000) });
  } catch { throw new NookApiError('The result could not be confirmed. The request may have completed. Check your Nooks or invitations before retrying to avoid duplicates.', 0, true); }
  let body: unknown;
  try { body = await response.json(); } catch { throw new NookApiError('The server returned an unreadable result. Check before retrying; the request may have completed.', response.status, true); }
  if (response.status !== 201) {
    const parsed = errorSchema.safeParse(body);
    let message = response.status === 401 ? 'Sign in to continue. Your entries are still here.' : parsed.success ? parsed.data.error.message : 'The request could not be completed.';
    // Next dev may normalize the route URL to localhost despite a 127.0.0.1 Host.
    // Correct the preview address instead of relaxing the server's origin guard.
    if (response.status === 403 && parsed.success && parsed.data.error.message === 'Cross-origin Nook requests are not allowed.' && typeof window !== 'undefined' && window.location?.hostname === '127.0.0.1') {
      message += ` For local development, open http://localhost${window.location.port ? `:${window.location.port}` : ''}/nooks/new and sign in there. No Nook was created by this rejected request.`;
    }
    throw new NookApiError(message, response.status, response.ok || response.status >= 500);
  }
  return body;
}
export async function createNook(data: CreateNookRequest): Promise<NookResponse> {
  const body = await post('/api/nooks', createNookSchema.parse(data));
  const parsed = nookResponseSchema.safeParse(body);
  if (!parsed.success) throw new NookApiError('Creation returned an unexpected result. Check your Nooks before retrying.', 201, true);
  return parsed.data;
}
export async function inviteNookMember(nookId: number, data: InviteNookMemberRequest): Promise<NookInvitationResponse> {
  idSchema.parse(nookId);
  const input = inviteNookMemberSchema.parse(data);
  const body = await post(`/api/nooks/${nookId}/invitations`, input);
  const parsed = invitationResponseSchema.safeParse(body);
  if (!parsed.success || parsed.data.invitation.nookId !== nookId || parsed.data.invitation.email.toLowerCase() !== input.email.toLowerCase() || parsed.data.invitation.role !== input.role || parsed.data.invitation.status !== 'pending') throw new NookApiError('Invitation returned an unexpected result. Check invitations before retrying.', 201, true);
  return parsed.data;
}
