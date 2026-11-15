import 'server-only';

export class VoiceBodyError extends Error {
  constructor(message: string, readonly status: 400 | 408 | 413) {
    super(message);
  }
}

/** Enforce limits while streaming, even without a trustworthy Content-Length. */
export async function readVoiceBody(request: Request, limit: number, signal: AbortSignal): Promise<Buffer> {
  if (Number(request.headers.get('content-length')) > limit) {
    throw new VoiceBodyError('Request body exceeds the allowed size.', 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new VoiceBodyError('The request body is empty.', 400);
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    if (signal.aborted) cancel();
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        cancel();
        throw new VoiceBodyError('Request body exceeds the allowed size.', 413);
      }
      chunks.push(value);
    }
    if (signal.aborted) throw new VoiceBodyError('Reading the request timed out or was cancelled.', 408);
    return Buffer.concat(chunks);
  } finally {
    signal.removeEventListener('abort', cancel);
    reader.releaseLock();
  }
}
