import { nookResponse, nookBody } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { memoryResourceId } from '@/lib/memories/http';
import { listContributions, createContribution } from '@/lib/memories/service';
import { createContributionSchema } from '@/lib/memories/types';
import type { ContributionListResponse, ContributionResponse } from '@/lib/memories/types';

export async function GET(request: Request, { params }: NookRouteContext) {
  return nookResponse<ContributionListResponse>(request, async (user) => {
    const ids = await params;
    const nookId = memoryResourceId(ids.nookId);
    return { contributions: await listContributions(user.id, nookId, memoryResourceId(ids.artifactId)) };
  });
}

export async function POST(request: Request, { params }: NookRouteContext) {
  return nookResponse<ContributionResponse>(request, async (user) => {
    const ids = await params;
    const nookId = memoryResourceId(ids.nookId);
    const data = await nookBody(request, createContributionSchema);
    return { contribution: await createContribution(user.id, nookId, memoryResourceId(ids.artifactId), data) };
  }, 201);
}
