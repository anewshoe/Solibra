import type { UpdateNookRequest, NookResponse, AcceptNookInvitationResponse } from '@/lib/nooks/types';
import { updateNookSchema } from '@/lib/nooks/types';
import { numericNookId } from './real-nooks';

export class NookRequestError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'NookRequestError'; }
}
export async function nookRequest<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(path, { method, credentials: 'same-origin', cache: 'no-store', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) }); }
  catch { throw new NookRequestError(0, 'Connection lost. Check before retrying a change; it may have completed.'); }
  if (!response.ok) {
    const message = response.status === 401 ? 'Please sign in again.' : response.status === 403 ? 'You don’t have permission for this action.' : response.status === 404 ? 'This Nook is unavailable or you no longer have access.' : response.status === 409 ? 'This invitation is no longer pending. Refresh to check its status.' : 'Unable to complete this request. Please try again.';
    throw new NookRequestError(response.status, message);
  }
  try { return await response.json(); } catch { throw new NookRequestError(0, 'The server result could not be confirmed. Refresh before retrying a change.'); }
}
function validId(id: number) { if (numericNookId(String(id)) !== id) throw new Error('Invalid real resource ID'); return id; }
export async function saveNookDescription(id: number, data: UpdateNookRequest) {
  const result = await nookRequest<NookResponse>(`/api/nooks/${validId(id)}`, 'PATCH', updateNookSchema.parse(data));
  if (result.nook.id !== id) throw new Error('Unexpected Nook response');
  return result;
}
export async function acceptInvitation(nookId: number, invitationId: number) {
  const result = await nookRequest<AcceptNookInvitationResponse>(`/api/nooks/${validId(nookId)}/invitations/${validId(invitationId)}/accept`, 'POST');
  if (result.nookId !== nookId) throw new Error('Unexpected invitation response');
  return result;
}
