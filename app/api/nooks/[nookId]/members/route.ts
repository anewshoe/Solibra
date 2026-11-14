import { nookResponse, nookId } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { listNookMembers } from '@/lib/nooks/service';
import type { NookMembershipListResponse } from '@/lib/nooks/types';

export async function GET(request: Request, { params }: NookRouteContext) {
  return nookResponse<NookMembershipListResponse>(request, async (user) => {
    const ids = await params;
    return { members: await listNookMembers(user.id, nookId(ids.nookId)) };
  });
}
