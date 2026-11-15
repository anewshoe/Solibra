import { nookResponse, nookId } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { retrieveAvatar } from '@/lib/avatars/service';
export const runtime = 'nodejs';
export async function GET(request: Request, { params }: NookRouteContext) {
  return nookResponse(request, async user => retrieveAvatar(user.id, nookId((await params).userId)));
}
