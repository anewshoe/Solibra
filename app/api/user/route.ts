import { getUser } from '@/lib/db/queries';

export async function GET() {
  const user = await getUser();
  // Never expose the password hash through the existing account endpoint.
  if (!user) return Response.json(null);
  const { passwordHash: _passwordHash, ...profile } = user;
  return Response.json(profile, { headers: { 'Cache-Control': 'private, no-store' } });
}
