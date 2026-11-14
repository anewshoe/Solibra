import { nookResponse, nookId } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { revokeNookInvitation } from '@/lib/nooks/service';
import type { NookSuccessResponse } from '@/lib/nooks/types';

export async function DELETE(request: Request, { params }: NookRouteContext) {
  return nookResponse<NookSuccessResponse>(request, async (user) => {
    const ids = await params;
    return revokeNookInvitation(user.id, nookId(ids.nookId), nookId(ids.invitationId));
  });
}
