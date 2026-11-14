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
   short sentence, stop, and listen to it. Source language is detected
   automatically; no spoken-language selection is required.
5. Choose a different translation language and submit. Confirm the original
   transcript, detected language, and translated text. Play the original audio
   again after processing. Choose the matching language to verify the transcript
   is returned unchanged as the translation.
6. Record again and confirm old results disappear. Test Discard and microphone
   denial. The recording stops at three minutes, or earlier if it exceeds 4 MiB.

Restart the server after changing keys. `dev:voice` sets the development bypass
and a launcher marker, fixes the bind address to 127.0.0.1, and does not forward
arguments that could override it. Do not expose this server through a tunnel.
The bypass also checks loopback request hosts, rejects nonlocal forwarding and
the RFC `Forwarded` header, and is disabled when `VERCEL` is set.
Setting `VOICE_DEV_AUTH_BYPASS` alone in normal `pnpm dev` has no effect.
Production always requires the existing signed session and an active database user.
These are local development checks, not a way to secure a tunnel: a proxy can
rewrite request headers. Never point a tunnel at `dev:voice`. Use an authenticated
HTTPS deployment for remote/mobile testing. For normal authenticated local
development, use `pnpm dev`.

### Testing without PostgreSQL

The voice access helper loads database queries only after session validation.
However, the existing shared root layout imports Drizzle, which requires a
nonempty `POSTGRES_URL` even when no query will run. Keep the existing configured
Neon/local PostgreSQL URL; if missing, obtain the actual development configuration
from the database owner. The bypass avoids user lookup inside the voice routes,
but does not change the shared layout or make the full app independent of its
database configuration. Use a private browser window to avoid a stale session
causing database lookups in the layout. No placeholder credentials were used for
the checks below, and no database/authentication files were changed.

## Manual test checklist

Use a new recording for each source-language test. Speak for 5–15 seconds, stop,
listen, select the target, and submit. Check names and cultural references as well
as the translation's meaning. Existing French (`fra` and `fre` → `fr`) and new
Telugu (`tel` → `te`) share the same dropdown, API validation, and matching logic.

| Spoken recording | Target | Expected detected language | Check |
| --- | --- | --- | --- |
| Spanish | English | `es` | Original Spanish plus English translation |
| French | English | `fr` | Original French plus English translation |
| Telugu | English | `te` | Original Telugu plus English translation |
| English | French | `en` | French translation |
| English | Telugu | `en` | Telugu translation |
| Telugu | Telugu | `te` | Translation equals the original transcript exactly |

For the last row the server's matching-language shortcut returns the transcript
without constructing a Gemini client. Automated tests verify this with no Gemini
key configured. Detection still needs intelligible spoken Telugu; a wrong
detected language is a recognition issue, not a target-language setting.

After a successful result, play the original audio again. Changing the target
retains the transcript and offers **Translate transcript**, using only the
translation route. **Discard** clears audio/results; **Record again** clears old
results and starts a new memory. Verify these controls after an error too.

Failure checks:

1. Deny microphone access in browser site settings, click Record, and check the
   permission error. Re-enable access in site settings and record again.
2. Record first, then set DevTools Network to Offline and submit. Check that an
   error appears and playback still works. Restore Online and retry. Do not share
   HAR exports or request bodies containing recordings or transcripts.
3. To exercise a real partial translation failure locally, stop the normal dev
   server and run `GEMINI_TRANSLATION_MODEL=solibra-test-unavailable pnpm dev:voice`.
   Record English and select French. Expect a non-2xx response with the original
   transcript visible and a translation error. Change the target to English and
   click Translate transcript: the matching-language shortcut should succeed
   without another transcription or Gemini call. In DevTools Network, check that
   the retry is `/api/voice/translate` with no audio upload. Afterwards restart
   normally with `pnpm dev:voice`. This deliberately invalid test setting is
   process-local; do not put it in deployment configuration.
4. Try a short recording on Chrome and Safari. For mobile, open the real HTTPS
   deployment, sign in, allow microphone permission, and record 5–10 seconds.
   Check stop/playback/submit/re-record. Safari may use MP4/M4A, Chrome WebM/Opus.
   Do not use a LAN HTTP URL or a tunnel to the bypass server. If the app has no
   configured authenticated HTTPS deployment yet, this mobile check is pending.

## Upload and deployment limits

The shared file limit is **4 MiB (4,194,304 bytes)**. The complete multipart body
is limited to **4,259,840 bytes**, allowing 64 KiB for fields, headers, and boundary
overhead. This is below Vercel's documented **4.5 MB** request limit. Both declared
Content-Length and actual streamed bytes are checked before multipart parsing.
The browser also checks recording bytes and keeps the three-minute duration cap.
An over-limit recording is discarded with a size error; make a shorter recording.
No conversion, external storage, database tables, or persistence are introduced.

The Node.js process route still declares `maxDuration = 120`, with a 110-second
processing deadline, 15-second upload read deadline, and bounded provider calls
(Scribe 70 seconds, Gemini 35 seconds, no automatic retries). The translation-only
route declares 60 seconds, with a 45-second deadline and 10-second body-read limit.
Actual platform/proxy limits still apply, including time spent authenticating.

Vercel's current documentation lists a 300-second maximum on Hobby with **Fluid
compute** enabled, so 120 seconds is within that published limit. Pro/Enterprise
allow at least 800 seconds. This repository has no linked Vercel project/plan or
deployment settings to verify; the code declaration does not establish the
deployed allowance. Confirm Fluid compute and the resulting function timeout in
the actual project before the demo. Legacy/non-Fluid configurations may have
lower limits. Inspect the deployed function configuration with
`vercel inspect <deployment-url> --json`, or check it in the Vercel dashboard.
No deployment or hosting-plan change was made here.

Sources checked November 14, 2026:
[Vercel function limits](https://vercel.com/docs/functions/limitations) and
[function duration configuration](https://vercel.com/docs/functions/configuring-functions/duration).
Use Node.js 22+ and actual server-side `POSTGRES_URL`, `AUTH_SECRET`,
`ELEVENLABS_API_KEY`, and `GEMINI_API_KEY` configuration. Network access is needed
for providers and the shared layout's Google Font during a clean build.

## Integration contract

Submit multipart FormData with exactly one `audio` File and one `targetLanguage`
code. The language list in `lib/voice/languages.ts` retains Cursor's existing
choices, including `en`, `es`, `zh` (Mandarin), `fr` (French), and `te` (Telugu).
Detected ISO 639-3 languages such as `eng`, `spa`, `cmn`, `fra`, and `tel` normalize
to the corresponding short codes. Other detected codes are retained.

Successful JSON:

```json
{
  "transcript": "Original spoken transcript",
  "originalLanguage": "es",
  "translation": "English translation",
  "targetLanguage": "en"
}
```

Errors before transcription return `{ "error": "Actionable message" }` and a
non-2xx status. When only translation fails, the status remains non-2xx and the
body includes the completed transcript; no `translation` field is returned:

```json
{
  "error": "Translation failed. Try again.",
  "stage": "translation",
  "transcript": "Original spoken transcript",
  "originalLanguage": "te",
  "targetLanguage": "en"
}
```

The page labels this as **transcription complete, translation not complete**.
**Retry translation** posts JSON `{ transcript, originalLanguage, targetLanguage }`
to `POST /api/voice/translate`. It uses the same signed-session/active-user and
cross-origin checks as uploads; it is not a public AI proxy. JSON bodies are
bounded to 128 KiB and transcripts to 20,000 characters, with language validation
and timeouts. It calls only the Gemini helper, never ElevenLabs. Same-language
requests skip Gemini too. Successful retries return the original four-field
success contract. The transcript remains browser memory only, so refreshing or
closing the page loses it. A dropped connection or platform kill before delivery
can still lose a completed transcript; durable recovery remains deferred to the
future persistence work.

Responses
use `Cache-Control: no-store`. Uploads are limited before multipart parsing,
including requests without Content-Length. MIME types and container signatures
are validated; the provider performs full decoding. Provider calls are bounded
by timeouts. Hosting restrictions are described above.

For a later frontend, reuse `useAudioRecorder`, `filenameForAudio`, the language
list, and `VoiceProcessResult`. Keep AI imports on the server. Uploading does not
consume or revoke the recording Blob. The app logs only static provider error
labels/status codes, never recordings, transcript text, keys, or provider bodies.
Provider-side data retention follows each provider's account settings.

## Checks

```sh
pnpm install --frozen-lockfile
pnpm test:voice
pnpm exec tsc --noEmit
pnpm build
```

Current merged branch: `feat/voice-memories`, based on merge commit `30ffcac`.
Main's Neon/PostgreSQL/Drizzle/authentication work and Stripe removal are present.
The old Stripe/pricing build failure is obsolete: those routes are removed.
The separate nested `saas-starter/` checkout remains untouched and excluded from
root TypeScript checks.

Results on November 14, 2026:

- Frozen installation passed without changing dependency versions.
- All **20 automated tests passed**. They cover French/Telugu normalization,
  target validation and provider-free language matching; authentication/origins;
  byte/stream/time limits; Chrome/Safari format handling; sanitized failures;
  recorder cleanup/races; and client partial-error recovery/duplicate prevention.
  The client contract test uses a failed HTTP response fixture. Provider-success
  responses are not mocked, and the genuine same-language shortcut is tested.
- `pnpm exec tsc --noEmit` passed.
- `pnpm build` passed using the existing environment and network access for fonts.
  Existing warnings about the middleware convention and baseline browser data
  remain; shared application files were not modified to silence them.
- **Real provider/HTTP checks:** a 4.7-second nonpersonal English WAV was
  transcribed by Scribe v3 and translated to Telugu with HTTP 200. Separately,
  real transcription followed by an intentionally unavailable Gemini model
  returned HTTP 502 with the transcript retained. Retrying that transcript to
  French returned HTTP 200; Scribe was called exactly once across both attempts.
  Transcript text and keys were not logged. No `.env` file was changed.
- **Browser check:** the page loads with French/Telugu choices and the 4 MiB limit.
  This does not verify microphone hardware, decoding/playback, language quality,
  spoken French/Telugu recognition, or mobile behavior; use the checklist above.
  The user's prior manual Spanish test remains the existing speech-test evidence.

No database migrations, deployment, branch operations, commits, or pushes were
performed. Durable partial recovery, abuse quotas beyond existing authentication,
and integration with the final frontend/database remain outside this MVP.
