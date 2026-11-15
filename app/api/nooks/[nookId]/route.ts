import { nookResponse, nookId, nookBody } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { getNook, updateNook } from '@/lib/nooks/service';
import { updateNookSchema } from '@/lib/nooks/types';
import type { NookResponse } from '@/lib/nooks/types';

export async function GET(request: Request, { params }: NookRouteContext) {
  return nookResponse<NookResponse>(request, async (user) => {
    const ids = await params;
    return { nook: await getNook(user.id, nookId(ids.nookId)) };
  });
}

export async function PATCH(request: Request, { params }: NookRouteContext) {
  return nookResponse<NookResponse>(request, async (user) => {
    const ids = await params;
    const data = await nookBody(request, updateNookSchema);
    return { nook: await updateNook(user.id, nookId(ids.nookId), data) };
  });
}
