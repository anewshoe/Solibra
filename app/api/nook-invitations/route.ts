import { nookResponse } from '@/lib/nooks/http';
import { listMyNookInvitations } from '@/lib/nooks/service';
import type { NookInvitationListResponse } from '@/lib/nooks/types';

export async function GET(request: Request) {
  return nookResponse<NookInvitationListResponse>(request, async (user) => {
    return { invitations: await listMyNookInvitations(user.id) };
  });
}
