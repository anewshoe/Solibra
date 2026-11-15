import { createMessageSchema, type CreateMessageRequest, type Message, type MessageResponse } from '@/lib/memories/types';
import type { NookMembership } from '@/lib/nooks/types';
import { numericNookId } from './real-nooks';
import { NookRequestError } from './nook-api';

export function memberCountLabel(count: number) { return `${count} ${count === 1 ? 'member' : 'members'}`; }
export function conversationHref(id: number) {
  if (numericNookId(String(id)) !== id) throw new Error('Invalid real Nook ID');
  return `/messages/${id}`;
}
export function orderedMessages(messages: Message[], nookId: number): Message[] {
  return [...new Map(messages.filter(message => message.nookId === nookId).map(message => [message.id,message])).values()]
    .sort((a,b) => Date.parse(a.createdAt)-Date.parse(b.createdAt) || a.id-b.id);
}
export function senderName(message: Message, viewerId: number, members: NookMembership[]) {
  if (message.senderId === viewerId) return 'You';
  const member=members.find(member => member.nookId === message.nookId && member.userId === message.senderId);
  return member ? member.user.name?.trim() || 'Nook member' : 'Former member';
}
export class MessageSendError extends NookRequestError {
  constructor(status: number, message: string, public uncertain = false) { super(status,message); }
}
export async function sendNookMessage(nookId: number, input: CreateMessageRequest): Promise<MessageResponse> {
  conversationHref(nookId);
  const parsed = createMessageSchema.parse(input);
  let response: Response;
  try { response = await fetch(`/api/nooks/${nookId}/messages`, { method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(parsed),signal:AbortSignal.timeout(30_000) }); }
  catch { throw new MessageSendError(0,'The send result is unknown. Refresh the conversation before retrying; your message may already be saved.',true); }
  if (response.status !== 201) {
    const text = response.status === 401 ? 'Sign in again to send messages.' : response.status === 403 ? 'You don’t have permission to send here.' : response.status === 404 ? 'This Nook is unavailable or your membership has ended.' : response.status === 400 ? 'Check your message. Use 1–5,000 characters and a valid memory reference.' : 'The send result could not be confirmed. Refresh before retrying.';
    throw new MessageSendError(response.status,text,response.ok || response.status>=500);
  }
  let result: MessageResponse;
  try { result = await response.json(); } catch { throw new MessageSendError(201,'The saved message could not be confirmed. Refresh before retrying.',true); }
  const message=result?.message;
  if (!message || numericNookId(String(message.id)) !== message.id || message.nookId!==nookId || numericNookId(String(message.senderId))!==message.senderId || message.content!==(parsed.content??'') || (message.type??'text')!==(parsed.type??'text') || message.artifactId!==(parsed.artifactId??null) || !Number.isFinite(Date.parse(message.createdAt)) || (message.artifactId!==null && numericNookId(String(message.artifactId))!==message.artifactId)) throw new MessageSendError(201,'The saved message returned an unexpected result. Refresh before retrying.',true);
  return result;
}
