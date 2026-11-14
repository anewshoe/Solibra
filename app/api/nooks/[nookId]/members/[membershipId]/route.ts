import { nookResponse, nookId, nookBody } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { manageNookMember } from '@/lib/nooks/service';
import { updateNookMemberSchema } from '@/lib/nooks/types';
import type { NookSuccessResponse } from '@/lib/nooks/types';

export async function PATCH(request: Request, { params }: NookRouteContext) {
  return nookResponse<NookSuccessResponse>(request, async (user) => {
    const ids = await params;
    const data = await nookBody(request, updateNookMemberSchema);
    return manageNookMember(user.id, nookId(ids.nookId), nookId(ids.membershipId), data.role);
  });
}

export async function DELETE(request: Request, { params }: NookRouteContext) {
  return nookResponse<NookSuccessResponse>(request, async (user) => {
    const ids = await params;
    return manageNookMember(user.id, nookId(ids.nookId), nookId(ids.membershipId));
  });
}
