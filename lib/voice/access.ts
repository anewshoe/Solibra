import 'server-only';

import { getSession } from '@/lib/auth/session';

export type VoiceAccess =
  | { ok: true }
  | { ok: false; status: 401 | 503; message: string };

/**
 * Paid transcription must not be an open proxy.
 * Local testing must also bind next dev to 127.0.0.1. Never trust forwarded
 * headers to grant the bypass; nonlocal forwarding explicitly disables it.
 */
function isLoopbackHost(host: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]'].includes(
      new URL(`http://${host}`).hostname
    );
  } catch {
    return false;
  }
}

function devAuthBypassEnabled(request: Request): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.VOICE_DEV_AUTH_BYPASS === 'true' &&
    process.env.VOICE_DEV_LOOPBACK_ONLY === 'true' &&
    isLoopbackHost(new URL(request.url).host) &&
    isLoopbackHost(request.headers.get('host') ?? '') &&
    (request.headers.get('x-forwarded-host') ?? '').split(',')
      .every((host) => !host || isLoopbackHost(host.trim())) &&
    (request.headers.get('x-forwarded-for') ?? '').split(',')
      .every((ip) => !ip || ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip.trim()))
  );
}

export async function authorizeVoiceRequest(request: Request): Promise<VoiceAccess> {
  if (devAuthBypassEnabled(request)) {
    return { ok: true };
  }

  try {
    const session = await getSession();
    if (
      !session?.user || !Number.isInteger(session.user.id) || session.user.id <= 0 ||
      !Number.isFinite(Date.parse(session.expires)) || Date.parse(session.expires) <= Date.now()
    ) {
      return {
        ok: false,
        status: 401,
        message: 'Sign in before submitting a recording.',
      };
    }
  } catch {
    return {
      ok: false,
      status: 401,
      message: 'Sign in before submitting a recording.',
    };
  }

  try {
    // Loading queries initializes Drizzle. Keep local voice testing independent
    // of the database, and turn database setup failures into a controlled 503.
    const { getUser } = await import('@/lib/db/queries');
    const user = await getUser();
    if (!user) {
      return {
        ok: false,
        status: 401,
        message: 'Sign in before submitting a recording.',
      };
    }
    return { ok: true };
  } catch {
    return {
      ok: false,
      status: 503,
      message:
        'Could not verify your session. Confirm the database is running.',
    };
  }
}
