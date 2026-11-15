import { nookResponse, nookBody } from '@/lib/nooks/http';
import type { NookRouteContext } from '@/lib/nooks/http';
import { memoryResourceId } from '@/lib/memories/http';
import { initiateMediaUpload, retrieveMedia, deleteMedia } from '@/lib/media/service';
import { mediaUploadSchema } from '@/lib/media/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request, { params }: NookRouteContext) {
  return nookResponse(request, async (user) => {
    const ids = await params;
    const data = await nookBody(request, mediaUploadSchema);
    return initiateMediaUpload(user.id, { nookId: memoryResourceId(ids.nookId), artifactId: memoryResourceId(ids.artifactId), contributionId: null }, data);
  }, 201);
}

export async function GET(request: Request, { params }: NookRouteContext) {
  return nookResponse(request, async (user) => {
    const ids = await params;
    return retrieveMedia(user.id, { nookId: memoryResourceId(ids.nookId), artifactId: memoryResourceId(ids.artifactId), contributionId: null }, request.headers.get('range'));
  });
}

export async function DELETE(request: Request, { params }: NookRouteContext) {
  return nookResponse(request, async (user) => {
    const ids = await params;
    return deleteMedia(user.id, { nookId: memoryResourceId(ids.nookId), artifactId: memoryResourceId(ids.artifactId), contributionId: null });
  });
}
