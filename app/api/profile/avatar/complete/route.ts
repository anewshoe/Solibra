import { nookResponse, nookBody } from '@/lib/nooks/http';
import { completeAvatar } from '@/lib/avatars/service';
import { avatarCompleteSchema } from '@/lib/avatars/types';
export const runtime = 'nodejs';
export async function POST(request: Request) {
  return nookResponse(request, async user => completeAvatar(user.id, (await nookBody(request, avatarCompleteSchema)).uploadToken));
}
