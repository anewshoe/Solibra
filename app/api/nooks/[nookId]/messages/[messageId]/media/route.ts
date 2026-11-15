import { nookResponse, nookBody } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { messageScope } from '@/lib/messages/http';
export const runtime='nodejs';
import { initiateMediaUpload,retrieveMedia,deleteMedia } from '@/lib/messages/media';
import { mediaUploadSchema } from '@/lib/media/types';
export async function POST(request:Request,{params}:NookRouteContext){return nookResponse(request,async user=>initiateMediaUpload(user.id,messageScope(await params),await nookBody(request,mediaUploadSchema)));}
export async function GET(request:Request,{params}:NookRouteContext){return nookResponse(request,async user=>retrieveMedia(user.id,messageScope(await params),request.headers.get('range')));}
export async function DELETE(request:Request,{params}:NookRouteContext){return nookResponse(request,async user=>deleteMedia(user.id,messageScope(await params)));}
