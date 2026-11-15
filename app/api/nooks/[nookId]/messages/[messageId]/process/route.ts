import { nookResponse, nookBody } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { messageScope } from '@/lib/messages/http';
export const runtime='nodejs';
import { processMessage,listMessageTranslations } from '@/lib/messages/voice';
import { processContributionSchema,translateContributionSchema } from '@/lib/voice/persistence-types';
export const maxDuration=180;
export async function POST(request:Request,{params}:NookRouteContext){return nookResponse(request,async user=>{const result=await processMessage(user.id,messageScope(await params),await nookBody(request,processContributionSchema),'process',AbortSignal.any([request.signal,AbortSignal.timeout(140000)]));return Response.json(result,{status:'stage' in result?result.status:200});});}
