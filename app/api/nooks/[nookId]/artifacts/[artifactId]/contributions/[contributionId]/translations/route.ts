import { nookResponse, nookBody } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { persistedVoiceScope } from '@/lib/voice/persistence-http';
import { runPersistedVoice, listSavedTranslations } from '@/lib/voice/persistence';
import { translateContributionSchema } from '@/lib/voice/persistence-types';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(request: Request, { params }: NookRouteContext) {
  return nookResponse(request, async (user) => {
    const scope = persistedVoiceScope(await params);
    const data = await nookBody(request, translateContributionSchema);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(140_000)]);
    const result = await runPersistedVoice(user.id, scope, data, 'translation', signal);
    return Response.json(result, { status: 'stage' in result ? result.status : 200 });
  });
}

export async function GET(request: Request, { params }: NookRouteContext) {
  return nookResponse(request, async (user) => listSavedTranslations(user.id, persistedVoiceScope(await params)));
}
