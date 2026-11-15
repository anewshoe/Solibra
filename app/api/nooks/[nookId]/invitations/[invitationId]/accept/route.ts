import { nookResponse, nookId } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { acceptNookInvitation } from '@/lib/nooks/service';
import type { AcceptNookInvitationResponse } from '@/lib/nooks/types';

export async function POST(request: Request, { params }: NookRouteContext) {
  return nookResponse<AcceptNookInvitationResponse>(request, async (user) => {
    const ids = await params;
    return acceptNookInvitation(user.id, nookId(ids.nookId), nookId(ids.invitationId));
  });
}
