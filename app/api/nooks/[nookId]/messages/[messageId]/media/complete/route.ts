import { nookResponse, nookBody } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { messageScope } from '@/lib/messages/http';
export const runtime='nodejs';
import { completeMediaUpload } from '@/lib/messages/media';
import { mediaCompleteSchema } from '@/lib/media/types';
export async function POST(request:Request,{params}:NookRouteContext){return nookResponse(request,async user=>completeMediaUpload(user.id,messageScope(await params),(await nookBody(request,mediaCompleteSchema)).uploadToken));}
