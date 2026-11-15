# Private photos and recordings (Task 4)

The Oregon PostgreSQL database remains the source of users, Nooks, membership, artifacts, contributions, and media references. The separate Ohio Neon **Free** project `solibra-media`, stable branch, private bucket `solibra-private` stores the bytes. No database connection, schema, historical migration, frontend screen, recorder, or ElevenLabs/Gemini endpoint was changed. No new table or migration is required.

## Configuration and the $0 limit

The lazy storage client reads the existing server-only names:

```text
AWS_ENDPOINT_URL_S3
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_REGION=us-east-2
SOLIBRA_MEDIA_BUCKET=solibra-private
AUTH_SECRET  (existing session secret; used to derive a separate upload-signing key)
```

`NEON_STORAGE_ENDPOINT`, `NEON_STORAGE_ACCESS_KEY_ID`, `NEON_STORAGE_SECRET_ACCESS_KEY`, and `NEON_STORAGE_REGION` are optional explicit aliases and take precedence over the corresponding AWS variables. These are useful if a hosting environment reserves AWS-standard variable names. Never use `NEXT_PUBLIC_` for these settings. The adapter accepts only HTTPS Ohio Neon branch endpoints and the explicitly selected bucket, preventing accidental use of an AWS S3 account or another provider. It creates no resources and changes no cloud settings. Missing/invalid configuration produces a sanitized 503 only when media is used; it does not prevent app startup/builds.

Keep both Neon projects on **Free**. Official current pricing includes 5 GB Object Storage per project and 5 GB public egress per project/month, shared across that project's products, without a required credit card or paid trial. Free storage limits apply across that project's branches. This implementation does not purchase usage, upgrade a plan, or call provisioning APIs. It cannot detect a later dashboard plan upgrade using storage credentials: continuing the $0 guarantee depends on keeping the accounts on Free. Quota, throttling, and provider errors fail safely with 503 rather than changing plans or attaching a failed upload. Do not enable paid plans to bypass limits.

Verified provider references:

- [Neon Free pricing](https://neon.com/pricing)
- [Plans, storage and egress allowances](https://neon.com/docs/introduction/plans)
- [Storage limits and supported regions](https://neon.com/docs/storage/overview#limits)
- [Private buckets and manual creation](https://neon.com/docs/storage/buckets)
- [Storage credentials and branch binding](https://neon.com/docs/storage/authentication)
- [Supported POST policies, copy, ranges, and CORS](https://neon.com/docs/storage/s3-compatibility)
- [Vercel's 4.5 MB function request limit](https://vercel.com/docs/functions/limitations#request-body-size)

Neon storage credentials belong to the Ohio storage branch and descendants, not the Oregon database branch. No second user database or Neon Auth migration is needed. Nook authorization happens in the app using Oregon records. Oregon and Ohio branching/restores do not automatically coordinate; keep one stable storage branch for this demo.

### Required manual browser CORS configuration

Direct browser uploads require the existing private bucket to allow your app's actual origins. This is separate from bucket public access: **keep the bucket private**. No CORS changes were applied automatically. Using the Ohio credentials and endpoint, an administrator can configure `PutBucketCors` through an S3-compatible client or AWS CLI. The AWS CLI has no infrastructure subscription requirement and must point at the Neon endpoint, not AWS S3.

Example CORS JSON (replace the example deployed origin with your real HTTPS domain; keep only origins you use):

```json
{
  "CORSRules": [{
    "AllowedOrigins": ["http://localhost:3000", "https://YOUR-SOLIBRA-DOMAIN"],
    "AllowedMethods": ["POST"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 300
  }]
}
```

Save that JSON outside tracked secrets, then run this **manually**, after loading the Ohio AWS variables into the shell securely:

```powershell
aws s3api put-bucket-cors --bucket solibra-private --endpoint-url $env:AWS_ENDPOINT_URL_S3 --cors-configuration file://cors.json
```

Do not run `neon env pull` against the media project over the existing `.env`; it can overwrite database connection settings. Copy only the storage settings yourself. Postman ignores browser CORS, so a Postman upload passing does not verify browser CORS configuration.

## Routes and frontend-safe contracts

There are two media resource paths:

```text
/api/nooks/:nookId/artifacts/:artifactId/media
/api/nooks/:nookId/artifacts/:artifactId/contributions/:contributionId/media
```

Both support:

| Method | Purpose | Request / response |
| --- | --- | --- |
| POST | Authorize direct upload or replacement | `{ contentType, byteSize }` → `MediaUploadResponse` (201) |
| POST `.../media/complete` | Verify uploaded object and attach it | `{ uploadToken }` → `MediaCompleteResponse` (201) |
| GET | Stream the attached private media | Binary response, 200 or 206 for a Range |
| DELETE | Delete only attached media, retaining the artifact/contribution | `{ success: true }` (200) |

Import request/response contracts and limits from `@/lib/media/types`. No route accepts an arbitrary storage key. Artifact creation and contribution creation remain separate and unchanged; media is optional. Text/letter/other artifacts and text contributions cannot use these media routes. A photo artifact accepts JPEG, PNG, or WebP. Audio artifacts and audio contributions accept the current recorder/pipeline formats: WebM, MP4/M4A, Ogg, WAV, MPEG/MP3, and AAC, including known MIME aliases and codec suffixes. Limits: **5,000,000 bytes per image**, **4,194,304 bytes (4 MiB) per audio recording**, minimum 16 bytes. SVG, HTML, unsupported formats, contradictory resource types, and invalid signatures are rejected. Header/container checks are not a full image/codec decoder or malware scan.

Initiation request:

```json
{ "contentType": "image/png", "byteSize": 12345 }
```

Initiation response shape:

```json
{
  "upload": {
    "url": "https://OHIO-STORAGE-ENDPOINT/solibra-private",
    "method": "POST",
    "fields": { "key": "SERVER-STAGING-KEY", "OTHER-SIGNED-FIELDS": "..." },
    "expiresAt": "ISO timestamp",
    "uploadToken": "SHORT-LIVED-RESOURCE-BOUND-TICKET",
    "contentType": "image/png",
    "byteSize": 12345
  }
}
```

Send all returned `fields` unchanged in multipart form data to `upload.url`, append **one `file` field last**, and let the browser generate the multipart Content-Type. The policy authorizes only that exact temporary object key, MIME type, and exact file length for **120 seconds**. Do not send your app session cookie to storage. The signed fields and token are temporary bearer upload permissions; do not log, share, or persist them. They reveal no secret storage credential and grant no bucket read/list/delete permission. A removed member can still use an already-issued policy until it expires, but cannot finalize or read through Solibra after removal.

Then POST `{ "uploadToken": "RETURNED-TICKET" }` to the corresponding `/complete` endpoint within **five minutes**. Completion reauthenticates the same user, verifies current membership/management rights and URL identity, and rejects a stale database key/version with 409. It copies the staging object to a fresh server-only object key, verifies the copy's actual size, MIME, and first 32 bytes, then commits its reference. This immutable-copy step prevents a replay of the staging upload policy from overwriting a published object. No bytes are sent through Vercel upload functions, no photo/audio bytes are saved in PostgreSQL, and validation reads only a bounded prefix instead of buffering the whole recording.

Completion response:

```json
{
  "media": {
    "url": "/api/nooks/10/artifacts/20/media",
    "contentType": "image/png",
    "byteSize": 12345
  },
  "cleanupPending": false
}
```

`media.url` is the authenticated application route, not a permanent object URL. Display it in `<img src>` or `<audio controls src>` with the same-origin session cookie. Range requests support audio seeking. Responses include canonical Content-Type, inline safe filename, `X-Content-Type-Options: nosniff`, `Cross-Origin-Resource-Policy: same-origin`, `Cache-Control: private, no-store`, `Vary: Cookie`, and `Accept-Ranges: bytes`. Single `bytes=start-end`, `bytes=start-`, and suffix ranges are supported. Invalid/multiple ranges return 416 with `Content-Range: bytes */SIZE`. There is no redirect or signed GET download URL. Every new request checks current membership; an already-authorized in-flight response cannot be recalled after revocation.

Storage keys are opaque random UUID paths under:

```text
nooks/N/artifacts/A/objects/UUID.ext
nooks/N/artifacts/A/contributions/C/objects/UUID.ext
```

Only the existing `artifacts.media_storage_key` or `contributions.audio_storage_key` is updated, plus its existing updated timestamp. MIME/size remain in object metadata and are read with authenticated HEAD, so no redundant metadata columns or migration are needed. Temporary keys use `/staging/`, are never attached to records, and are also private. Existing Task 3 responses may contain these opaque keys, but the keys alone cannot authorize media reads or storage access.

## Permission and failure behavior

The routes reuse `nookResponse`, the existing session validation/Origin protection, `requireNookMembership`, and explicit parent-Nook checks. The shared response wrapper now also supports streaming Responses. There is no voice development-auth bypass on media routes.

- Current members can read attached media.
- Artifact creators manage their artifact's media; contribution authors manage their contribution's audio.
- Nook owners can moderate either. Other members receive 403 for management operations.
- Missing session: 401. Inaccessible/missing Nook/resource/media: 404. Unsupported type/signature: 415. Invalid size: 413. Invalid/forged ticket or request: 400. Changed resource/reference: 409. Storage/config/database failure: sanitized 503.
- Requests with foreign Nook/artifact/contribution IDs never use a caller-selected key. A stored key outside the exact expected resource namespace is rejected. Completion tokens bind account, Nook, artifact, optional contribution, previous key, version, MIME, size, staging key, and expiration.
- Resource updates serialize with shared Nook locks and row locks, coordinating with existing membership-management operations. No replacement retires the previous object before the new object is verified and its database reference committed.
- Provider failure leaves the old media reference in place. After a failed database transaction, completion attempts candidate cleanup only after a fresh database read proves the candidate is not referenced. A lost commit acknowledgement or failed reconciliation read retains the private candidate rather than risk deleting successfully published media.
- After successful publication, old-object or staging cleanup failure returns `cleanupPending: true`. The new media works, but unused private files may remain. Do not blindly reupload just to clear that flag.
- DELETE removes the attached object first, then clears the database key within the locked operation. Provider deletion failure returns an error and leaves the reference for retry. If database clearing/commit fails after object deletion, the response is an error; retry DELETE to clear the stale reference. Deletion is idempotent. There is no distributed transaction between PostgreSQL and object storage.

No cleanup worker/table was introduced. Abandoned/expired staging uploads, policy replay after completion, ambiguous commits, or failed best-effort cleanup may leave private orphans. An administrator can inspect expired `/staging/` objects and reconcile unreferenced `/objects/` keys against Oregon records before manually deleting them. Never bulk-delete `/objects/` without checking database references. Neon currently stores lifecycle configuration without enforcing expiration rules, so a lifecycle rule is not a cleanup guarantee. No automatic recursive cleanup is performed.

## Connecting the existing frontend (no component changes made)

The merged frontend still uses sample string artifact/persona IDs, fixture image paths, and temporary `blob:` recording URLs in its demo state. These are not authenticated backend identities. Before persisting a file, create/load the real numeric Nook/artifact/contribution record using the existing APIs.

An optional browser utility is available without modifying the teammate's components:

```typescript
import { uploadPrivateMedia } from '@/lib/frontend/media-client';

// After creating a photo artifact through the memory API:
const saved = await uploadPrivateMedia(`/api/nooks/${nookId}/artifacts/${artifactId}/media`, photoFile);
// Use saved.media.url for the photo src; report saved.cleanupPending if true.

// After creating { type: 'audio' } through the contribution API:
const audio = await uploadPrivateMedia(
  `/api/nooks/${nookId}/artifacts/${artifactId}/contributions/${contributionId}/media`,
  recorder.audioBlob!,
);
// Use audio.media.url for AudioPlayer's src. Do not persist the blob: URL.
```

The utility initiates authorization, posts multipart directly to storage with `credentials: omit`, then completes through the app using `credentials: same-origin`. It does not redesign screens or invoke speech processing. The caller should surface errors, handle cleanupPending, and refetch the record after replacements/deletions. Display updated media using no-store requests; do not add these routes to a public CDN/service-worker offline cache. Browser CORS setup above is required.

## Postman tests (use a development Nook; no destructive production tests)

1. Run the app with the confirmed Ohio storage variables and unchanged Oregon database URLs. Sign in as A, B, and C in separate browser profiles. Use their session cookies in separate local-secret Postman variables, never exported or shared. Clear Postman's cookie jar when switching accounts; app requests use `Cookie: session={{sessionA}}`, and JSON POSTs use `Content-Type: application/json`.
2. As A, create a Nook, invite B, and have B accept using the existing Nooks APIs. C remains outside the Nook. Create a photo artifact using `{ "type": "photo", "title": "Weekend photo" }`. Record numeric Nook/artifact IDs.
3. Determine the image file's exact byte length. As A, POST `/api/nooks/N/artifacts/A/media` with `{ "contentType": "image/png", "byteSize": ACTUAL_BYTES }`. Expect 201, signed fields, and an uploadToken. Save these only locally for the next requests.
4. Create a separate request to the returned `upload.url`. Turn off inherited Authorization and cookies. Choose POST, Body → form-data. Add every returned field as Text without alterations, then add `file` as a File field **last**, selecting that exact PNG. Do not manually set multipart Content-Type. Expect a provider 2xx response (typically 204). If it is rejected, inspect only the provider error code locally; do not post signed fields/secrets in logs or screenshots. Oversized/wrong-MIME forms must not pass the signed policy.
5. As A, POST `/api/nooks/N/artifacts/A/media/complete` with `{ "uploadToken": "RETURNED_TOKEN" }`. Expect 201 with the application media URL, correct MIME/size, and `cleanupPending: false`. Changing the token/account/URL resource must fail. Repeating completion after publication should return 409.
6. GET the returned media route as A and B. Both should return 200, the same image bytes, and the private/nosniff headers above. Postman can display the image. As C or without cookies, GET must return 404 or 401, respectively. Adding `?key=OTHER_KEY` cannot select another object. An unsigned direct GET to the private provider object must be denied.
7. Repeat for an audio artifact (`{ "type": "audio", "title": "A story" }`) using a real WebM/MP4/WAV recording under 4 MiB. Also create an audio contribution with `{ "type": "audio" }` and use its contribution media path; B may manage a contribution B authored even if A owns the parent artifact. Both A and B can retrieve the result. GET with `Range: bytes=0-1023` should return 206 and Content-Range; an out-of-bounds or multiple range should return 416.
8. As ordinary member B, attempt to replace or DELETE A's artifact media: 403. As Nook owner A, manage B's contribution audio: allowed. Use an artifact or contribution from another Nook through these URLs: 404. Supplying a storage key in upload/complete JSON returns 400. Text artifacts/contributions reject media operations.
9. Start another upload as A on the photo artifact, upload it, then complete it. The media URL stays stable, the stored key changes, and retrieval shows the new file. Stale outstanding completions must return 409; they must not overwrite the latest reference. Invalid signature files (e.g. HTML named .png) must fail completion with 415, preserving the previous attached photo.
10. DELETE the attachment as its creator or Nook owner. Expect 200 `{ "success": true }`; GET now returns 404 while the artifact/contribution remains. DELETE again returns 200. Unrelated attachments remain accessible.
11. Remove B from the Nook and repeat B's GET and management requests: 404. If B initiated an upload before removal, B cannot complete it after removal. A still has access. Do not test provider/database failure by revoking real credentials or breaking the live database; failure recovery is covered by mocks.
12. Run the browser upload with the optional helper after manual CORS configuration. Postman is not sufficient to validate browser CORS. Verify playback and seeking in Chrome and Safari using recordings from the existing hook.

## Tests and remaining work

Run `pnpm.cmd test:media`, the existing Nooks/memory/voice/frontend tests, `pnpm.cmd exec tsc --noEmit`, and `pnpm.cmd build`. Media tests use actual routes, shared authorization, real cryptographic tickets, and SQL expressions, with scripted database results and mocked storage/SDK operations. They exercise identities, cross-Nook isolation, creator/owner rules, publication, signatures/limits, range retrieval, replacement, cleanup, and error handling. Mocked transaction tests do not establish live PostgreSQL/Neon atomicity or actual provider wire compatibility. No live upload/replacement/deletion tests run automatically.

The voice pipeline remains standalone. It can later read verified stored recordings through a trusted server-side operation that repeats Nook authorization or through these authenticated download endpoints. This task does not call ElevenLabs/Gemini, persist their results, or change transcripts/translations when an attachment changes. Before connecting processing, add version checks and a deliberate transcript/translation invalidation policy so replacing audio cannot leave stale generated text. Image/container signatures do not prove codec decodability; live browser/provider smoke tests remain necessary.

## Implementation files and verification results

Created:

- `lib/media/types.ts`, `lib/media/validation.ts`, `lib/media/storage.ts`, `lib/media/tickets.ts`, `lib/media/service.ts`
- `app/api/nooks/[nookId]/artifacts/[artifactId]/media/route.ts` and `media/complete/route.ts`
- `app/api/nooks/[nookId]/artifacts/[artifactId]/contributions/[contributionId]/media/route.ts` and `media/complete/route.ts`
- `lib/frontend/media-client.ts`, `tests/media.test.cjs`, `docs/private-media.md`

Modified: `lib/nooks/http.ts` (stream response support), `package.json` and `pnpm-lock.yaml` (two S3 SDK dependencies and media test script), and `.env.example` (names only). No files were deleted. The actual `.env` was not edited. No SQL migration was created or applied.

Verification passed: TypeScript, production build, 14 Nooks tests, 15 memory tests, 20 voice tests, 8 frontend tests, and 22 media tests (**79 total**). The existing middleware-deprecation and browser-mapping-age build warnings remain; no lint script is configured.

A real, read-only HeadBucket request succeeded against the configured Ohio bucket. This verified bucket/credential connectivity without uploading, listing, replacing, deleting, or printing credentials. Live end-to-end media uploads/downloads, browser CORS/playback, and real database transaction recovery were not exercised; use the manual walkthrough above.
