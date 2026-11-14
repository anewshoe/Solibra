import type { NookErrorCode } from './types';

export class NookError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: NookErrorCode,
    message: string
  ) { super(message); }
}
