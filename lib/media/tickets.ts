import 'server-only';
import { createHmac } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';
import { NookError } from '@/lib/nooks/errors';

const ticketSchema = z.object({
  userId: z.number().int().positive(), nookId: z.number().int().positive(),
  artifactId: z.number().int().positive(), contributionId: z.number().int().positive().nullable(),
  stagingKey: z.string(), contentType: z.string(), byteSize: z.number().int().positive(),
  previousKey: z.string().nullable(), version: z.string()
});
export type UploadTicket = z.infer<typeof ticketSchema>;
function key() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new NookError(503, 'INTERNAL_ERROR', 'Private Nook uploads are not configured.');
  return createHmac('sha256', secret).update('solibra-private-media-upload-v1').digest();
}
export async function signTicket(ticket: UploadTicket) {
  return new SignJWT(ticket).setProtectedHeader({ alg: 'HS256' }).setIssuedAt()
    .setIssuer('solibra').setAudience('private-media-upload').setExpirationTime('5m').sign(key());
}
export async function readTicket(value: string): Promise<UploadTicket> {
  const signingKey = key();
  try {
    const { payload } = await jwtVerify(value, signingKey, {
      algorithms: ['HS256'], issuer: 'solibra', audience: 'private-media-upload'
    });
    return ticketSchema.parse(payload);
  } catch {
    throw new NookError(400, 'INVALID_REQUEST', 'Nook upload authorization is invalid or expired. Start a new upload.');
  }
}
