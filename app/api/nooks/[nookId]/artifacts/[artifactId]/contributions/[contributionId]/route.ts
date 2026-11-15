import { nookResponse } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { memoryResourceId } from '@/lib/memories/http';
import { getContribution } from '@/lib/memories/service';
import type { ContributionResponse } from '@/lib/memories/types';

export async function GET(request: Request, { params }: NookRouteContext) {
  return nookResponse<ContributionResponse>(request, async (user) => {
    const ids = await params;
    const nookId = memoryResourceId(ids.nookId);
    return { contribution: await getContribution(user.id, nookId, memoryResourceId(ids.artifactId), memoryResourceId(ids.contributionId)) };
  });
}
