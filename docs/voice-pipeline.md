# Voice memory MVP

The independent pipeline is `MediaRecorder → POST /api/voice/process → ElevenLabs
Scribe v3 → Gemini translation`. Nothing is written to the database. The browser
keeps the original audio Blob and playback URL through processing, including
processing failures. Discard, re-record, and unmount release that URL.

## Local testing

1. Use Node.js 22 or newer and install from the root: `pnpm install --frozen-lockfile`.
2. In the ignored root `.env`, set `ELEVENLABS_API_KEY` to the **secret API key**
   (not its ID), and set `GEMINI_API_KEY`. Do not use `NEXT_PUBLIC_` variables.
   `GEMINI_TRANSLATION_MODEL` is optional; the default is `gemini-3.1-flash-lite`.
3. Use your existing signed-in session and database, or start the isolated local
   test path:

   ```sh
   pnpm dev:voice
   ```

4. Open <http://localhost:3000/dev/voice>. For bypass testing, use a private browser
   window without an existing Solibra session. Allow microphone access. Record a
   short sentence in English, Spanish, or Mandarin, stop, and listen to it.
5. Choose a different translation language and submit. Confirm the original
   transcript, detected language, and translated text. Play the original audio
   again after processing. Choose the matching language to verify the transcript
   is returned unchanged as the translation.
6. Record again and confirm old results disappear. Test Discard and microphone
   denial. The recording stops at three minutes, or earlier if it exceeds 15 MB.

Restart the server after changing keys. `dev:voice` sets the development bypass
and a launcher marker, fixes the bind address to 127.0.0.1, and does not forward
arguments that could override it. Do not expose this server through a tunnel.
The bypass also checks loopback request hosts and rejects nonlocal forwarding.
Setting `VOICE_DEV_AUTH_BYPASS` alone in normal `pnpm dev` has no effect.
Production always requires the existing signed session and an active database user.

### Testing without PostgreSQL

The voice access helper loads database queries only after session validation.
However, the existing shared root layout imports Drizzle, which requires a
nonempty `POSTGRES_URL` even when no query will run. If the variable is missing,
the smallest isolated workaround is a process-local placeholder, with no session
cookie in the browser:

```sh
POSTGRES_URL=postgres://voice:voice@127.0.0.1:5432/voice pnpm dev:voice
```

This is for the unauthenticated voice test page only. Dashboard and login flows
still need a real database. No database, auth, middleware, or layout changes are
needed for this workaround.

## Integration contract

Submit multipart FormData with exactly one `audio` File and one `targetLanguage`
code. The language list in `lib/voice/languages.ts` retains Cursor's existing
choices, including `en`, `es`, and `zh` (Mandarin). Detected ISO 639-3 languages
such as `eng`, `spa`, and `cmn` normalize to those short codes. Other detected
codes are retained.

Successful JSON:

```json
{
  "transcript": "Original spoken transcript",
  "originalLanguage": "es",
  "translation": "English translation",
  "targetLanguage": "en"
}
```

Errors return `{ "error": "Actionable message" }` and a non-2xx status. Responses
use `Cache-Control: no-store`. Uploads are limited before multipart parsing,
including requests without Content-Length. MIME types and container signatures
are validated; the provider performs full decoding. Provider calls are bounded
by timeouts. Host deployments must support the upload limit and up to 120 seconds
for this Node.js route; a host can enforce stricter limits than this application.

For a later frontend, reuse `useAudioRecorder`, `filenameForAudio`, the language
list, and `VoiceProcessResult`. Keep AI imports on the server. Uploading does not
consume or revoke the recording Blob. The app logs only static provider error
labels/status codes, never recordings, transcript text, keys, or provider bodies.
Provider-side data retention follows each provider's account settings.

## Checks

```sh
pnpm test:voice
pnpm exec tsc --noEmit
pnpm build
```

Tests cover local/production authorization, expired sessions, database failures,
multipart validation, upload limits, credential/provider failures, language
matching, and recorder lifecycle races. Successful transcription and translation
responses are never mocked. Browser microphone, real playback, and translation
quality still need the manual steps above.

After correcting the local ElevenLabs credential (the original value was a key
ID instead of a secret), a real request to `/api/voice/process` returned HTTP 200
with all four fields. A 4.7-second nonpersonal synthetic WAV was transcribed by
Scribe v3, detected as English, and translated into Spanish by Gemini. No
transcript content was logged. Real standalone Gemini translation with
`gemini-3.1-flash-lite` also succeeded. Cursor's previous `gemini-2.5-flash`
returned 404, and a trial of `gemini-3.8-flash` returned 503, so the verified
Flash-Lite model is now the default.

The production build compiled and passed type checking, then failed while
prerendering the existing `/pricing` page because Stripe rejected its configured
key. Payment code was left unchanged. Network access is also required to fetch
the shared layout's Google font during a clean build. The separate nested
`saas-starter/` checkout is preserved and excluded from root TypeScript checks.
