import 'server-only';
import { createHmac } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { NookError } from '@/lib/nooks/errors';
import { avatarUploadSchema } from './types';

const schema = avatarUploadSchema.extend({
  userId: z.number().int().positive(), stagingKey: z.string(),
  previousKey: z.string().nullable(), version: z.string()
});
export type AvatarTicket = z.infer<typeof schema>;
function key() {
  if (!process.env.AUTH_SECRET) throw new NookError(503, 'INTERNAL_ERROR', 'Profile photo uploads are not configured.');
  return createHmac('sha256', process.env.AUTH_SECRET).update('solibra-avatar-upload-v1').digest();
}
export async function signAvatarTicket(value: AvatarTicket) {
  return new SignJWT(value).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
    .setIssuer('solibra').setAudience('avatar-upload').setExpirationTime('5m').sign(key());
}
export async function readAvatarTicket(value: string) {
  const secret = key();
  try {
    const { payload } = await jwtVerify(value, secret, { algorithms: ['HS256'], issuer: 'solibra', audience: 'avatar-upload' });
    // JWT claims are intentionally excluded from the strict request schema.
    const { iat: _iat, exp: _exp, iss: _iss, aud: _aud, ...ticket } = payload;
    return schema.parse(ticket);
  } catch { throw new NookError(400, 'INVALID_REQUEST', 'Profile photo authorization is invalid or expired. Start a new upload.'); }
}
