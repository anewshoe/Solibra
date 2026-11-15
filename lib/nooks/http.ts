import 'server-only';
import type { z } from 'zod';
import { getUser } from '@/lib/db/queries';
import type { User } from '@/lib/db/schema';
import type { NookErrorResponse } from './types';
import { NookError } from './errors';

export type NookRouteContext = { params: Promise<Record<string, string>> };

export function nookId(value: string): number {
  const id = Number(value);
  if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(id)) {
    throw new NookError(400, 'INVALID_REQUEST', 'Invalid Nook resource ID.');
  }
  return id;
}
export async function nookBody<S extends z.ZodTypeAny>(request: Request, schema: S): Promise<z.output<S>> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new NookError(400, 'INVALID_REQUEST', 'Send the Nook request as application/json.');
  }
  let body: unknown;
  try { body = await request.json(); } catch {
    throw new NookError(400, 'INVALID_REQUEST', 'Invalid Nook JSON request.');
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new NookError(400, 'INVALID_REQUEST', `Invalid Nook request: ${result.error.issues[0].message}`);
  }
  return result.data;
}
export async function nookResponse<T>(
  request: Request, action: (user: User) => Promise<T>, status = 200
): Promise<Response> {
  const headers = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      const origin = request.headers.get('origin');
      if (origin && origin !== new URL(request.url).origin) {
        throw new NookError(403, 'FORBIDDEN', 'Cross-origin Nook requests are not allowed.');
      }
    }
    const user = await getUser();
    if (!user) throw new NookError(401, 'UNAUTHENTICATED', 'Sign in to access Nooks.');
    const result = await action(user);
    if (result instanceof Response) {
      // Private media endpoints reuse this session/origin guard for streams.
      for (const [name, value] of Object.entries(headers)) result.headers.set(name, value);
      return result;
    }
    return Response.json(result, { status, headers });
  } catch (error) {
    if (!(error instanceof NookError)) console.error('Nook operation failed.', error);
    const known = error instanceof NookError;
    const body: NookErrorResponse = { error: {
      code: known ? error.code : 'INTERNAL_ERROR',
      message: known ? error.message : 'Unable to complete the Nook request.'
    } };
    return Response.json(body, { status: known ? error.status : 500, headers });
  }
}
