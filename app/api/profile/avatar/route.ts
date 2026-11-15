import { nookResponse, nookBody } from '@/lib/nooks/http';
import { initiateAvatar, deleteAvatar } from '@/lib/avatars/service';
import { avatarUploadSchema } from '@/lib/avatars/types';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return nookResponse(request, async user => initiateAvatar(user.id, await nookBody(request, avatarUploadSchema)));
}
export async function DELETE(request: Request) {
  return nookResponse(request, user => deleteAvatar(user.id));
}
