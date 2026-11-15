import { nookResponse, nookId, nookBody } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { inviteNookMember, listNookInvitations } from '@/lib/nooks/service';
import { inviteNookMemberSchema } from '@/lib/nooks/types';
import type { NookInvitationResponse, NookInvitationListResponse } from '@/lib/nooks/types';

export async function GET(request: Request, { params }: NookRouteContext) {
  return nookResponse<NookInvitationListResponse>(request, async (user) => {
    const ids = await params;
    return { invitations: await listNookInvitations(user.id, nookId(ids.nookId)) };
  });
}

export async function POST(request: Request, { params }: NookRouteContext) {
  return nookResponse<NookInvitationResponse>(request, async (user) => {
    const ids = await params;
    const data = await nookBody(request, inviteNookMemberSchema);
    return { invitation: await inviteNookMember(user.id, nookId(ids.nookId), data.email, data.role) };
  }, 201);
}
