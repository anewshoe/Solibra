import { getUser } from '@/lib/db/queries';
import { withoutPasswordHash } from '@/lib/frontend/account';

export async function GET() {
  const user = await getUser();
  // Never expose the password hash through the existing account endpoint.
  if (!user) return Response.json(null);
  return Response.json(withoutPasswordHash(user), { headers: { 'Cache-Control': 'private, no-store' } });
}
