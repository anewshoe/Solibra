import 'server-only';
import { nookId } from '@/lib/nooks/http';
import { NookError } from '@/lib/nooks/errors';

export function memoryResourceId(value: string): number {
  const id = nookId(value);
  if (id > 2_147_483_647) {
    throw new NookError(400, 'INVALID_REQUEST', 'Invalid Nook resource ID.');
  }
  return id;
}
