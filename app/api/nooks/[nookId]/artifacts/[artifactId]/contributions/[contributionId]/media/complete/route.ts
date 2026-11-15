import { nookResponse, nookBody } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { memoryResourceId } from '@/lib/memories/http';
import { completeMediaUpload } from '@/lib/media/service';
import { mediaCompleteSchema } from '@/lib/media/types';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function POST(request: Request, { params }: NookRouteContext) {
  return nookResponse(request, async (user) => {
    const ids = await params;
    const data = await nookBody(request, mediaCompleteSchema);
    return completeMediaUpload(user.id, { nookId: memoryResourceId(ids.nookId), artifactId: memoryResourceId(ids.artifactId), contributionId: memoryResourceId(ids.contributionId) }, data.uploadToken);
  }, 201);
}
