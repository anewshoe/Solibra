import { nookResponse } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { memoryResourceId } from '@/lib/memories/http';
import { getArtifact } from '@/lib/memories/service';
import type { ArtifactResponse } from '@/lib/memories/types';

export async function GET(request: Request, { params }: NookRouteContext) {
  return nookResponse<ArtifactResponse>(request, async (user) => {
    const ids = await params;
    const nookId = memoryResourceId(ids.nookId);
    return { artifact: await getArtifact(user.id, nookId, memoryResourceId(ids.artifactId)) };
  });
}
