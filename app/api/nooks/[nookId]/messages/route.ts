import { nookResponse, nookBody } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { memoryResourceId } from '@/lib/memories/http';
import { listMessages, createMessage } from '@/lib/memories/service';
import { createMessageSchema } from '@/lib/memories/types';
import type { MessageListResponse, MessageResponse } from '@/lib/memories/types';

export async function GET(request: Request, { params }: NookRouteContext) {
  return nookResponse<MessageListResponse>(request, async (user) => {
    const ids = await params;
    const nookId = memoryResourceId(ids.nookId);
    return { messages: await listMessages(user.id, nookId) };
  });
}

export async function POST(request: Request, { params }: NookRouteContext) {
  return nookResponse<MessageResponse>(request, async (user) => {
    const ids = await params;
    const nookId = memoryResourceId(ids.nookId);
    const data = await nookBody(request, createMessageSchema);
    return { message: await createMessage(user.id, nookId, data) };
  }, 201);
}
