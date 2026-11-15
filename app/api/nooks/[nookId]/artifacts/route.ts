import { nookResponse, nookBody } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { memoryResourceId } from '@/lib/memories/http';
import { listArtifacts, createArtifact } from '@/lib/memories/service';
import { createArtifactSchema } from '@/lib/memories/types';
import type { ArtifactListResponse, ArtifactResponse } from '@/lib/memories/types';

export async function GET(request: Request, { params }: NookRouteContext) {
  return nookResponse<ArtifactListResponse>(request, async (user) => {
    const ids = await params;
    const nookId = memoryResourceId(ids.nookId);
    return { artifacts: await listArtifacts(user.id, nookId) };
  });
}

export async function POST(request: Request, { params }: NookRouteContext) {
  return nookResponse<ArtifactResponse>(request, async (user) => {
    const ids = await params;
    const nookId = memoryResourceId(ids.nookId);
    const data = await nookBody(request, createArtifactSchema);
    return { artifact: await createArtifact(user.id, nookId, data) };
  }, 201);
}
