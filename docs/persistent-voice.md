# Persistent multilingual voice memories

Task 5 builds on the merged private media backend. Oregon PostgreSQL stores the existing contribution and translation records; the existing Ohio private bucket stores audio. No schema changes, migrations, new dependencies, environment variables, or cloud setup are required. The standalone voice APIs and frontend are preserved.

## API contract

All paths require the existing authenticated session cookie. Mutations retain the existing same-origin checks. Use real positive numeric IDs:

| Method | Path | Behavior |
| --- | --- | --- |
| POST | `/api/nooks/{nookId}/artifacts/{artifactId}/contributions/{contributionId}/process` | Load attached audio, transcribe if needed, then translate and save. |
| POST | `/api/nooks/{nookId}/artifacts/{artifactId}/contributions/{contributionId}/translations` | Translate the saved transcript without another audio upload or transcription. |
| GET | `/api/nooks/{nookId}/artifacts/{artifactId}/contributions/{contributionId}/translations` | Read saved translations. |

Process request:

```json
{"targetLanguage":"en","reprocess":false}
```

Translation request:

```json
{"targetLanguage":"fr"}
```

Both POSTs return HTTP 200 with this structure (the contribution contains all existing `Contribution` fields):

```json
{
  "contribution": {
    "id":30,"artifactId":20,"authorId":1,"type":"audio","content":null,
    "audioStorageKey":"nooks/10/artifacts/20/contributions/30/objects/example.wav",
    "originalTranscript":"Un recuerdo compartido.","sourceLanguage":"es",
    "processingStatus":"completed",
    "createdAt":"2026-11-14T00:00:00.000Z","updatedAt":"2026-11-14T00:01:00.000Z"
  },
  "translation": {
    "id":1,"contributionId":30,"sourceLanguage":"es","targetLanguage":"en",
    "translatedText":"A shared memory.","createdAt":"2026-11-14T00:01:00.000Z"
  },
  "cached":false
}
```

The illustrative key is never an upload input or public URL. Use the existing authenticated media GET route for playback. GET translations returns `{"translations":[...]}` with those translation objects, or an empty list. Read the existing contribution GET endpoint for transcript and processing status after refreshing the page. Shared browser-safe types and schemas are in `lib/voice/persistence-types.ts`.

If transcription succeeds but translation fails, the non-2xx response preserves the saved contribution:

```json
{
  "error":{"code":"INTERNAL_ERROR","message":"Nook translation failed. Check provider availability or free quota, then retry."},
  "stage":"translation","status":502,
  "contribution":{"id":30,"originalTranscript":"Un recuerdo compartido.","sourceLanguage":"es","processingStatus":"completed"}
}
```

The example contribution is abbreviated. Timeout responses may use 504. Other errors use the existing `{error:{code,message}}` contract: 400 invalid body/IDs, 401 missing session, 403 unauthorized membership/management or origin, 404 wrong/missing scoped resource, 409 missing audio/transcript or concurrent/stale processing, 415 invalid audio, 422 unusable transcript, and sanitized provider/storage/database failures. The frontend should handle non-2xx partial responses, retain the original transcript, and offer translation retry.

## Permissions and consistency

Every operation checks Nook membership and artifact/contribution parentage. Any current member may read; only the contribution author or a Nook owner may process, translate, or retry. Knowing an ID or storage key grants no access. Permissions are checked again before saving results and before returning partial results.

Audio comes exclusively from the contribution's validated private storage key through the existing server adapter. No arbitrary URL, caller transcript, cookie forwarding, or server fetch of an application endpoint is accepted. The existing audio MIME/signature checks and 4 MiB limit apply. Provider calls run outside database transactions.

The existing `updatedAt` and `processingStatus` form a three-minute processing lease. A fresh in-flight request returns 409; after expiry, a new authorized request may recover it. Every write verifies the captured key, version and processing status under the existing resource locks. A late request cannot overwrite a newer lease or changed recording. There is no background worker or automatic retry.

Status lifecycle: attached audio starts `draft`; an active request sets `processing`; successful transcript/translation becomes `completed`. Failure before a transcript becomes `failed`; a saved transcript remains `completed` even if translation fails. Thus `completed` means source text is available, not that every requested language exists. Inspect translations and the request error to determine translation success. A terminated function may leave `processing` until the lease expires.

Audio replacement atomically clears transcript, source language and translations, and sets `draft`; deletion clears them and sets status to null. The key/version checks discard older in-flight results. Existing Task 4 cleanup/reconciliation behavior still applies if object deletion succeeds but database commit fails: retry the authorized media DELETE.

Language aliases normalize before lookup and persistence (for example `eng` to `en`). Unknown source languages persist as `und`, preserving the original transcript. Target languages use the existing supported language list. Translation uniqueness remains `(contributionId, sourceLanguage, targetLanguage)` with an upsert; repeated requests return saved results with `cached:true`. Translation retries reuse the transcript. Only explicit `reprocess:true` retranscribes existing source text; successful reprocessing invalidates older translations. If reprocessing fails before saving new source text, previous successful text remains available.

## Frontend integration

No frontend components were changed. After existing Task 4 audio finalization, call the process endpoint using the real Nook/artifact/contribution IDs. Display its saved transcript and translation, and refresh the existing contribution query. To change language, POST translations instead of reuploading audio or calling the standalone transcription route. On reload, read contribution plus saved translations. Use the shared request/response types above and preserve the original recording and transcript on partial failure.

## Postman and manual checks

1. Start the existing development server. Sign in through the existing login flow and preserve its session cookie in Postman's cookie jar. Use separate cookie jars/accounts for users A, B, and C. For POST requests set `Content-Type: application/json` and, if supplying Origin, use the exact application's origin.
2. Create or select a real Nook shared by A and B; C must not belong. Use the existing Nooks invitations API/UI to add B. Follow `docs/private-media.md` to create an artifact and audio contribution authored by A, and finalize a valid recording up to 4 MiB. Retain the real IDs; do not send a storage key to the process endpoint.
3. As A, POST process with `{"targetLanguage":"en"}`. Verify HTTP 200 and the saved source transcript/language, translated text and completed status. Fetch the existing contribution and GET translations to verify persistence across a reload. The recording remains retrievable through the authenticated media route.
4. Repeat the same process request. Expect `cached:true`; no additional transcription or translation is needed. Request French via POST translations with `{"targetLanguage":"fr"}`, then repeat it to verify cache reuse. Language aliases such as `eng` must reuse the canonical `en` entry.
5. As B, GET contribution, translations and media successfully. If B is an ordinary member and not the author, POST process/translations must return 403. A Nook owner may perform those mutations. As C, both reads and writes must be denied, including when supplying known IDs. Try an artifact or contribution belonging to a different Nook; it must not be accessible under this path.
6. With mocked failures (automated tests), verify translation failure preserves source text and translation-only retry avoids transcription. Do not exhaust real free quotas to simulate errors. Missing audio must produce 409; malformed/unsupported input must be rejected without provider calls.
7. Two simultaneous uncached processing requests should yield one active request and a 409 for the other. Retry after completion to obtain cached results. If the process is interrupted, wait three minutes before retrying. Explicit `reprocess:true` is the only intentional retranscription control.
8. Replace audio using Task 4: verify source text and translations clear and status returns to draft. Process the replacement. Delete the audio: verify text and translations clear and no playback remains. Automated tests pause provider calls while audio is replaced/deleted and verify old results cannot be reinserted.

## Limits, cost and validation

No billing or provider configuration is changed. Existing ElevenLabs/Gemini account quotas and model eligibility must be checked manually before a live demo; an API key does not guarantee a permanently free entitlement. Stop rather than upgrade or enable billing if a provider requires payment. Tests mock both providers, storage and PostgreSQL and incur no service usage. Recorded audio uses the existing Scribe v3 integration and translation uses the existing Gemini model; no provider/model migration is included. See [ElevenLabs speech-to-text documentation](https://elevenlabs.io/docs/overview/capabilities/speech-to-text) and [Gemini rate limits](https://ai.google.dev/gemini-api/docs/rate-limits) for current provider/account constraints.

The process request carries JSON only; audio uploads retain Task 4's direct private upload flow. A combined request has a 140-second application deadline and declares a 180-second route duration; deployment plan limits may terminate it sooner. These settings do not buy a longer execution allowance. For the demo, use short recordings and verify the deployed plan timeout manually. Transcripts above the existing translation helper's 20,000-character cap fail safely. There is no durable queue or guarantee of completing work after disconnect/termination.

Run `pnpm test:persisted-voice`, `pnpm test:media`, TypeScript and the production build. The new mocked suite covers authorization, parent scoping, unsupported inputs, persistence/cache reuse, translation-only retries, failure recovery, language normalization, concurrency, invalidation, stale results, cancellation and revoked membership. Real provider quality, deployed timeouts and Neon transaction behavior require the manual checks above; automated checks never apply migrations or write to Neon.

Implementation verification: TypeScript and `pnpm build` passed; all 136 automated tests passed, including 19 new persistence tests and 22 media tests. No lint script is configured. The build retains existing middleware-deprecation and outdated browser-mapping warnings. No live provider requests, media writes, database migrations or production database writes were performed for this task.

Created: the process and translations route files, `lib/voice/persistence.ts`, `lib/voice/persistence-types.ts`, `lib/voice/persistence-http.ts`, `tests/voice-persistence.test.cjs`, and this guide. Modified: `lib/media/service.ts` (authorized private audio loading and atomic invalidation), `lib/ai/translate.ts` (generic memory wording), `tests/media.test.cjs` (invalidation expectations), `package.json` (test command), and `docs/private-media.md` (integration reference). No files were deleted.
