import { nookResponse, nookBody } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { persistedVoiceScope } from '@/lib/voice/persistence-http';
import { runPersistedVoice } from '@/lib/voice/persistence';
import { processContributionSchema } from '@/lib/voice/persistence-types';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(request: Request, { params }: NookRouteContext) {
  return nookResponse(request, async (user) => {
    const scope = persistedVoiceScope(await params);
    const data = await nookBody(request, processContributionSchema);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(140_000)]);
    const result = await runPersistedVoice(user.id, scope, data, 'process', signal);
    return Response.json(result, { status: 'stage' in result ? result.status : 200 });
  });
}
