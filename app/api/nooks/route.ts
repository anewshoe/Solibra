import { nookResponse, nookBody } from '@/lib/nooks/http';
import { createNook, listNooks } from '@/lib/nooks/service';
import { createNookSchema } from '@/lib/nooks/types';
import type { NookListResponse, NookResponse } from '@/lib/nooks/types';

export async function GET(request: Request) {
  return nookResponse<NookListResponse>(request, async (user) => {
    return { nooks: await listNooks(user.id) };
  });
}

export async function POST(request: Request) {
  return nookResponse<NookResponse>(request, async (user) => {
    const data = await nookBody(request, createNookSchema);
    return { nook: await createNook(user.id, data) };
  }, 201);
}
