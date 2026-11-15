# Private profile photos (Task 6)

One optional profile photo belongs to each account across all Nooks. Images use the existing private Ohio Neon bucket `solibra-private`; Oregon PostgreSQL stores only a nullable reference. No provider, dependency, credential, environment variable, cloud resource or paid feature was added. The branch was based on local main `712553d`, including merged UI and persistent voice work. Voice and Nook media routes/contracts remain unchanged.

## Migration: review and apply manually before testing

Generated files: `lib/db/migrations/0004_user_avatar.sql`, `lib/db/migrations/meta/0004_snapshot.json`, and a new entry in `meta/_journal.json`. Historical SQL and snapshots are unchanged. Exact SQL:

```sql
ALTER TABLE "users" ADD COLUMN "avatar_storage_key" text;
```

The column is nullable with no default. Existing users receive null; new accounts require no photo. No rows, relationships or constraints are removed. No migration has been applied by this implementation.

1. In Neon, select the intended **Oregon application project's development branch**, not the Ohio media project. Confirm the branch and database name. Preserve the existing database; do not reset or recreate it.
2. Review the SQL above and your existing Drizzle migration history. The app uses `POSTGRES_URL`; the existing `drizzle.config.ts` uses `DATABASE_URL`. Before running migration commands yourself, verify the migration connection resolves to that same intended Oregon development branch. A successful app connection alone does not verify the migration target. Do not print credentials or commit them.
3. After approving, run `pnpm db:migrate` yourself in a terminal whose existing `DATABASE_URL` points to that verified branch. This runs pending migrations and records them in Drizzle's migration history. Review any other pending migrations first. No `.env` edits or connection changes were made by this task. Do not run `db:setup`, `db:seed`, `push`, or a reset.
4. Prefer Drizzle's migrator over pasting SQL into the console: applying SQL manually without reconciling the migration ledger causes a later duplicate-column failure. For a separately approved SQL-console workflow, select the correct branch and coordinate its ledger explicitly.
5. Apply the approved migration before running/deploying this version with authenticated users: existing `getUser()` selects the complete users model and requires the new column. Run the same reviewed migration against each intended deployment database before releasing the application code there.

## Endpoints and shared contracts

All routes use the existing signed-session/active-account guard and same-origin mutation protection. No development authentication bypass is introduced. JSON bodies are strict; caller-selected user IDs, storage keys and external image URLs are rejected. Error bodies retain `{error:{code,message}}`; some shared guard errors retain existing Nook wording.

| Method | Exact path | Purpose |
| --- | --- | --- |
| POST | `/api/profile/avatar` | Authorize an upload for the signed-in account. |
| POST | `/api/profile/avatar/complete` | Verify and attach an upload using its signed ticket. |
| DELETE | `/api/profile/avatar` | Clear the signed-in account's photo and attempt object cleanup. |
| GET | `/api/users/{userId}/avatar` | Stream a permitted user's private photo. |

Initiation request (JPEG, PNG, or WebP; 16–2,000,000 bytes):

```json
{"contentType":"image/png","byteSize":123456}
```

Response structure:

```json
{
  "upload": {
    "url":"https://<existing-ohio-endpoint>/solibra-private",
    "method":"POST",
    "fields":{"key":"<temporary-object>","policy":"<restricted-policy>"},
    "uploadToken":"<short-lived-ticket>",
    "expiresAt":"2026-11-15T00:02:00.000Z",
    "contentType":"image/png","byteSize":123456
  }
}
```

The real `fields` contain all required signing fields; copy them exactly. Send them as multipart form fields to `upload.url` with the file **last**. Do not forward application cookies to storage. These credentials authorize only that exact staging object, type and size for 120 seconds, not bucket reads or arbitrary writes. Treat tickets and signed fields as sensitive and never log them. Existing bucket CORS supports the same direct POST workflow as Task 4; no CORS/configuration changes are required for an already working application origin.

Finalize request:

```json
{"uploadToken":"<ticket-from-initiation>"}
```

Finalize response:

```json
{"avatarUrl":"/api/users/12/avatar?v=2026-11-15T00%3A00%3A00.000Z","cleanupPending":false}
```

Deletion returns `{"avatarUrl":null,"cleanupPending":false}`. `cleanupPending:true` means the database change succeeded but old/staging object removal needs manual reconciliation. Refresh the profile rather than retrying an old completion ticket. GET streams image bytes with verified metadata, safe Content-Type, `nosniff`, `private, no-store`, `Vary: Cookie`, and same-origin resource policy. Avatar URLs are authenticated app paths, never public/signed download URLs. The version query refreshes displayed images after replacement; it is not authorization and old versions never select old objects.

Signed-out calls return 401; cross-origin writes 403; invalid requests/tickets 400; absent or inaccessible photos 404; stale tickets or invalid references 409; metadata/signature mismatch 415; sanitized service failures 503. The 2 MB limit is decimal (2,000,000 bytes). SVG, GIF, HEIC, audio and empty files are rejected. Image dimensions are not changed; existing rounded avatar components provide the display shape.

## Privacy, replacement and failure recovery

Namespaces are `users/{authenticatedUserId}/avatars/staging/{uuid}.{ext}` and `users/{authenticatedUserId}/avatars/objects/{uuid}.{ext}`. Original filenames are ignored. Avatar upload tickets have their own derived signing key and audience, distinct from session and Nook media tickets, and expire after five minutes.

Completion locks the current user row and checks both its previous key and `updatedAt`. It verifies actual metadata/signature, copies to an unpredictable server-only immutable object, verifies that copy, then updates the account reference and timestamp. Old object removal happens only after commit. A failed replacement leaves the old reference intact. Stale completion, including after removal or another replacement, returns 409. A fresh read reconciles ambiguous commits before attempting candidate cleanup; if reconciliation fails, the object is retained rather than risking deletion of the current image.

Deletion clears the reference transactionally, advances `updatedAt` even if already empty (invalidating outstanding tickets), then attempts object deletion. Cleanup failure leaves an inaccessible private orphan rather than a broken profile reference. Database failure before commit leaves the previous photo associated. Storage and database exceptions are sanitized without logging private values.

Users may retrieve their own photo. Other active authenticated users must share at least one current Nook membership with supported owner/member roles. The lookup uses both membership rows joined on Nook ID; friendship, global account role, an invitation or knowledge of an ID/key grants nothing. Leaving/removal denies subsequent requests unless another Nook remains shared. A request already authorized/in flight cannot recall bytes, and an already downloaded image cannot be revoked. No shared image caching is enabled.

Private storage keys and password hashes are excluded from `/api/user`, server-rendered SWR account fallback, profile guards, and Nook member responses. Account and member contracts expose only `avatarUrl` (or null) for the photo. Existing account fields and Nook role behavior remain intact.

## Frontend integration

The existing profile edit/setup/settings view includes a small reusable `AvatarEditor`, beside the existing account form, with upload/change/remove, busy state, validation and error/success messages. No profile redesign was introduced. The existing `AccountAvatar` uses Radix AvatarImage with the original initials fallback. Photos are wired into profile/account forms, the account-menu avatar, member profile cards and real Nook member avatars. Fixture/demo persona imagery is untouched.

`lib/frontend/avatar-client.ts` performs initiation, direct private POST and completion, without changing `uploadPrivateMedia()` or Nook media contracts. Successful changes revalidate account/member SWR data and refresh the router. Other members see the latest photo when their member data revalidates or the page reloads; there is no push notification. The existing user lookup reloads the persisted reference on every fresh session.

## Manual / Postman walkthrough

1. Apply the reviewed migration to the verified development branch yourself. Start the app normally. Sign in as A and select Edit Profile (or `/profile/edit`). Upload a real PNG/JPEG/WebP under 2 MB. Confirm the thumbnail, success message, and profile/member views.
2. Refresh, sign out and sign back in as A: the photo should remain. Use a different photo to replace it; the URL version should change. Remove it; initials should return, and GET of the old app URL should return 404 while there is no current photo.
3. For API testing, preserve the existing login session in Postman's cookie jar. POST initiation using the exact file MIME/size. Send every returned field to the returned URL as multipart with the binary file last (without app cookies). POST completion with only `uploadToken`. GET the returned app URL with the session cookie. This verifies live CORS only when repeated in the browser; Postman does not enforce CORS.
4. As B sharing a Nook with A, GET A's app avatar path successfully. As unrelated C, expect 404; without a session, expect 401. Remove B from their shared Nook and retry: 404. If a second shared Nook still exists, B should retain access. B/C cannot use A's ticket to change A's avatar; their own `/api/profile/avatar` always acts on their own account.
5. Check SVG, empty files, files over 2,000,000 bytes, and fake PNG metadata on JPEG bytes. They must not replace the current image. Do not alter storage credentials or exhaust real quotas to simulate failures; use mocked tests for those cases.
6. Initiate two uploads from the same profile version. Complete one, then the other: the second must return 409. Initiate an upload, remove the photo, then try completion: also 409. Mocked tests cover database/copy/cleanup failures and ambiguous commits without destructive bucket operations.
7. Recheck registration/login, profile name/email editing, invitations, real Nook views, private artifact/contribution media, and persistent voice processing. Their contracts and processing code were not changed.

## Files and verification

Created: `lib/avatars/{types,tickets,service}.ts`, `lib/frontend/avatar-client.ts`, `components/solibra/avatar-editor.tsx`, the three avatar route files above, `tests/avatars.test.cjs`, this guide, migration SQL and snapshot.

Modified: `lib/db/schema.ts`, migration journal, `lib/frontend/account.ts`, `lib/auth/require-profile-user.ts`, `app/api/user/route.ts`, `lib/nooks/{types,service}.ts`, `components/solibra/{account-avatar,account-form,profile,member-profile,real-nook,shell}.tsx`, `tests/account-profile.test.cjs` (safe contract expectation), and `package.json` (test command). No files were deleted. No `.env`, connection strings, cloud settings, voice processing files or historical migrations were changed. No commits, pushes or merges were made.

Run `pnpm test:avatars`, the complete `node --test` suite, `pnpm exec next typegen`, `pnpm exec tsc --noEmit` and `pnpm build`. Tests mock database/storage and make no paid API or bucket calls. Real browser upload/CORS, login persistence, deployed storage permissions and database transaction behavior still require the manual walkthrough after migration approval. Existing Free-plan quotas continue to apply; do not enable billing to bypass them.

Verification completed: Next.js type generation, standalone TypeScript, production build and all **167 automated tests passed**, including 15 avatar tests. No lint script is configured. The build retains the existing middleware-deprecation and outdated browser-mapping warnings. `git diff --check` passed. No live storage operations, migration execution or paid provider calls were performed.

MVP limitations: signature checks do not fully decode image pixels or detect decompression bombs; no cropping/resizing or antivirus service is added. Failed/abandoned staging uploads and failed cleanup can leave private orphans. There is no scheduled garbage collector; reconcile references before any manual cleanup, and never bulk-delete avatar prefixes. Deleting an account can also leave a private orphan; soft-deleted accounts' photos are not retrievable. No additional infrastructure is provisioned.
