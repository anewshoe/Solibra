# Memory backend MVP

This backend reuses the existing authenticated account, `teams` Nook infrastructure, per-Nook owner/member guard, error format, and `activity_logs`. It adds no authentication, membership, storage, or AI-provider system. Friends, families, and mixed groups use the same APIs and rules.

## Schema and decisions

| Table | Fields and relationships |
| --- | --- |
| `artifacts` | Serial ID, Nook FK (`teams`), creator FK (`users`), type, title, optional description, optional private media storage key, created/updated timestamps |
| `contributions` | Serial ID, artifact FK, author FK (`users`), text/audio type, optional content, private audio storage key, original transcript, source language, processing status, created/updated timestamps |
| `messages` | Serial ID, Nook FK, sender FK (`users`), text content, optional artifact reference, created timestamp |
| `translations` | Serial ID, contribution FK, source/target language, translated text, created timestamp |

Types use varchar columns plus database CHECK constraints. Artifact types are `photo`, `audio`, `letter`, `text`, and `other`. A written artifact or letter can keep its text in `description`; personal perspectives belong in contributions. A title-only artifact is allowed, including photo/audio placeholders. Text contributions require nonblank content and cannot carry audio/transcript/processing fields. Audio contributions have no text content and start as `draft`, with no upload required and no processing job scheduled.

Public create requests accept only the fields documented below. Creator/author/sender and parent IDs come from the signed session and URL, not JSON. Media keys, transcripts, language metadata, processing status, and timestamps are server-managed fields reserved for future integration; requests supplying them are rejected. This avoids letting clients attach arbitrary private objects before upload ownership validation exists. No public media URL field exists. Database checks additionally reject absolute URLs, leading slashes, whitespace, and traversal segments in storage keys. Plain text artifacts cannot have media keys.

Reserved audio processing states are `draft`, `pending`, `processing`, `completed`, and `failed`. Only `draft` is written by these APIs. Timestamps follow the existing starter's PostgreSQL timestamp convention and are serialized as ISO strings in API responses. `updated_at` starts at creation time; future pipeline writes/edits must explicitly update it. There are no update/delete routes in this task.

Common list paths have `(parent_id, created_at, id)` indexes. All lists are oldest-first, with ID as the timestamp tie-break. There is intentionally no pagination. Translations have a unique `(contribution_id, source_language, target_language)` constraint, which also indexes contribution lookups; future retries should upsert that language pair rather than append duplicate rows. Languages allow 2/3-letter codes and region subtags up to 35 characters. Unknown/empty detected language should remain `NULL` on the contribution; future translation code must resolve a valid source language before inserting a translation row.

Foreign keys use `NO ACTION`, with no cascading deletes or changes to existing data. The composite message FK `(artifact_id, nook_id)` points to the unique artifact pair `(id, nook_id)`, enforcing same-Nook chat references in PostgreSQL as well as the API. Contributions inherit their Nook through their artifact instead of duplicating a Nook column.

## Endpoints and frontend contracts

Import schemas and JSON request/response types from `@/lib/memories/types`. Dates are strings, nullable fields are explicit `null`, and create responses return the full new record, including its ID.

| Method | URL | Request | Response |
| --- | --- | --- | --- |
| POST | `/api/nooks/:nookId/artifacts` | `CreateArtifactRequest` | `ArtifactResponse`, 201 |
| GET | `/api/nooks/:nookId/artifacts` | None | `ArtifactListResponse`, 200 |
| GET | `/api/nooks/:nookId/artifacts/:artifactId` | None | `ArtifactResponse`, 200 |
| POST | `/api/nooks/:nookId/artifacts/:artifactId/contributions` | `CreateContributionRequest` | `ContributionResponse`, 201 |
| GET | `/api/nooks/:nookId/artifacts/:artifactId/contributions` | None | `ContributionListResponse`, 200 |
| GET | `/api/nooks/:nookId/artifacts/:artifactId/contributions/:contributionId` | None | `ContributionResponse`, 200 |
| POST | `/api/nooks/:nookId/messages` | `CreateMessageRequest` | `MessageResponse`, 201 |
| GET | `/api/nooks/:nookId/messages` | None | `MessageListResponse`, 200 |

Create request examples:

```json
{ "type": "photo", "title": "Our weekend trip", "description": "The rainy afternoon at the lake" }
```

```json
{ "type": "text", "content": "I remember how we all ran back to the car." }
```

```json
{ "type": "audio" }
```

```json
{ "content": "Does anyone remember this afternoon?", "artifactId": 20 }
```

Limits after trimming: artifact title 1–200 characters, description up to 10,000, text contribution 1–20,000, message 1–5,000. Optional description and message artifact ID may be omitted or `null`. Unknown JSON fields and unsupported types return 400. Route IDs must be positive PostgreSQL integer IDs. JSON POSTs require `Content-Type: application/json`.

Response envelopes are `{ artifact }`, `{ artifacts: [] }`, `{ contribution }`, `{ contributions: [] }`, `{ message }`, and `{ messages: [] }`. A representative artifact response is:

```json
{
  "artifact": {
    "id": 20,
    "nookId": 10,
    "creatorId": 1,
    "type": "photo",
    "title": "Our weekend trip",
    "description": "The rainy afternoon at the lake",
    "mediaStorageKey": null,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "updatedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

An audio contribution response includes its ID, artifact/author IDs, `type: "audio"`, `content: null`, `audioStorageKey: null`, `originalTranscript: null`, `sourceLanguage: null`, `processingStatus: "draft"`, and timestamps. A text contribution has the supplied content and null audio/pipeline fields. Messages return ID, Nook ID, sender ID, content, optional artifact ID, and created timestamp.

## Authorization and logging

Every route uses the existing `nookResponse` session wrapper. Every memory service operation uses `requireNookMembership`; there is no global-role or first-Nook fallback. Both owners and members can create/read memories and messages. Each operation takes a shared lock on the Nook row for the transaction, serializing against existing membership-management transactions that take an update lock. A removal that has committed takes effect on the next request; already-authorized operations can finish before removal commits.

Artifacts are selected by BOTH artifact ID and requested Nook ID. Contribution operations validate that parent first, then scope the contribution ID to its artifact. Message creation validates any referenced artifact against the requested Nook before insertion; the composite FK is a second layer of protection. Nonmembers and nonexistent Nooks both return 404 `Nook not found.`; wrong-Nook and nonexistent artifact IDs both return 404 `Nook artifact not found.`. A child under the wrong artifact returns 404 `Nook contribution not found.`. No private record is loaded before membership is checked.

Errors use the existing structure: `{ "error": { "code": "NOT_FOUND", "message": "Nook not found." } }`. No valid session gives 401 `UNAUTHENTICATED`; invalid input gives 400 `INVALID_REQUEST`; cross-origin POSTs give 403 `FORBIDDEN`; inaccessible/missing resources give 404 `NOT_FOUND`; unexpected failures give a generic 500 `INTERNAL_ERROR`. Responses are `private, no-store` and vary on the session cookie.

Artifact creation writes `CREATE_ARTIFACT` and contribution submission writes `SUBMIT_CONTRIBUTION` into the existing `activity_logs` table within the same transaction. If logging fails, the memory write rolls back. No new event table was created. The existing frontend activity formatter does not yet map these two action strings; displaying friendly labels is a small future UI integration for the teammate. Screens and styling were not changed.

## Postman walkthrough (manual; not run against Neon)

Use a development database/Neon branch, not a production database, for these writes. Review the SQL below before manually applying it. Check all earlier pending migrations too: the migration command applies pending entries in order. Do not reset, recreate, or seed the existing database. Do not assume a passing build means the schema is already installed. This implementation has not applied any migration or edited `.env`.

1. After approving the SQL for the intended development database, manually run `pnpm.cmd db:migrate` (Windows) or `pnpm db:migrate`. Confirm the runtime and migration connection settings point to the same intended database: this project currently uses `POSTGRES_URL` at runtime and `DATABASE_URL` in Drizzle configuration. Then run `pnpm.cmd dev`.
2. Register/sign in through the existing UI as A, B, and C using separate browser profiles. Postman does not use a bearer token: copy each account's `session` cookie from that browser's developer tools into separate **local secret** Postman variables `sessionA`, `sessionB`, and `sessionC`. Set request header `Cookie: session={{sessionA}}` as appropriate. Do not export/share these secrets. Set `baseUrl` to `http://localhost:3000`, and use raw JSON plus `Content-Type: application/json` on POST requests. Clear automatically stored cookies when switching accounts so Postman does not send the wrong session.
3. As A, `POST {{baseUrl}}/api/nooks` with `{ "name": "Weekend memories" }`. Record `nook.id` as `nookId`. Invite B with `POST /api/nooks/{{nookId}}/invitations`, body `{ "email": "B_EMAIL", "role": "member" }`, and record `invitation.id`. As B, `POST /api/nooks/{{nookId}}/invitations/INVITATION_ID/accept` (no body): expect 200. C stays outside this Nook.
4. As A, `POST /api/nooks/{{nookId}}/artifacts` with the photo example above. Expect 201 and `{ "artifact": { "id": ..., "nookId": ..., "creatorId": A_ID, ... } }`; record the ID as `artifactId`. `mediaStorageKey` is null: no upload occurred. GET that collection and GET `/api/nooks/{{nookId}}/artifacts/{{artifactId}}`: expect 200 and the same record. Repeat with `type: "text"` and a written memory in description if desired.
5. As B, `POST /api/nooks/{{nookId}}/artifacts/{{artifactId}}/contributions` with the text example. Expect 201, `authorId: B_ID`, and the correct `artifactId`; record `contribution.id`. GET the collection and GET the URL ending in `/contributions/CONTRIBUTION_ID`: expect 200. POST `{ "type": "audio" }` to the same collection: expect 201 with a draft and null audio/transcript fields, without needing ElevenLabs/Gemini credentials.
6. As B, `POST /api/nooks/{{nookId}}/messages` with `{ "content": "Remember this?", "artifactId": ARTIFACT_ID }` (use the numeric ID). Expect 201 and `senderId: B_ID`. Send `{ "content": "Hello everyone" }` too. GET `/api/nooks/{{nookId}}/messages`: expect both in ascending created-time/ID order. GET an empty collection in another joined Nook: expect its plural envelope containing `[]`.
7. As C, try all eight memory operations using the same Nook/artifact/contribution IDs and valid example bodies: every request should return 404 `Nook not found.`. With no session cookie, every route should return 401. Supplying IDs does not grant access.
8. As B, create a second Nook and an artifact there. Try its artifact ID through the shared Nook's GET artifact URL, contribution POST/GET URLs, and a shared-Nook message POST. Each must return 404, with no new contribution/message. Also try the first contribution ID under another valid artifact in the same Nook: 404. Verify that neither artifact's contributions/messages were changed by rejected requests.
9. Try `creatorId`, `authorId`, `senderId`, `nookId`, `mediaStorageKey`, `originalTranscript`, or `processingStatus` in a POST body: expect 400 for unexpected properties. Try blank titles/content, unknown types, text contributions without content, and audio contributions with content: expect 400. Content over the documented limits also returns 400. A missing artifact reference returns 404. A cross-origin browser POST is rejected with 403.
10. As A, GET `/api/nooks/{{nookId}}/members` and record B's **membership ID**, then DELETE `/api/nooks/{{nookId}}/members/MEMBERSHIP_ID`. Repeat B's memory reads/writes: all should now return 404. A still sees B's preserved contributions/messages; B still accesses their other Nooks. Removal does not delete memory records.

## Future private storage and voice integration

The existing voice routes, SDK helpers, access helper, recorder, and contracts are unchanged. They still process caller-supplied data and return results without preserving them or enforcing a specific Nook membership. These memory APIs do not call those routes or silently store their responses.

The future trusted integration should:

1. Resolve the account from the existing session, validate the requested Nook membership and artifact/contribution association, then create/verify a Nook-scoped upload destination.
2. Store the recording in private object storage and persist a validated opaque `audioStorageKey`/`mediaStorageKey`; never persist a public or signed URL. Authorize any future download URL issuance each time. Existing storage-key fields are not proof of ownership on their own.
3. Transition a draft audio contribution through processing states and explicitly update `updatedAt`. Run ElevenLabs using the verified recording, then map voice `transcript` → `originalTranscript` and `originalLanguage` → `sourceLanguage`. Normalize language codes and map unknown/empty detection to null.
4. Map Gemini `translation` → `translations.translatedText`, `originalLanguage` → `sourceLanguage`, and `targetLanguage` → `targetLanguage`, linked to the verified contribution. Resolve an unknown source language before inserting a translation. Use a trusted server operation, not client-supplied output fields.
5. Preserve a completed transcript if translation alone fails (`VoiceTranslationFailure` already carries it); translation retry should not discard/re-upload the audio. This may require a separate translation status/error field later—the current contribution status does not attempt to model two independent jobs.
6. Include verified contribution/artifact identity in future processing contracts, check membership on processing/retrieval, and recheck permission before attaching results when appropriate. Current voice contracts carry no IDs. Keep development voice-auth bypass away from persisted memory operations.

No translation CRUD, upload/download endpoints, cloud storage, voice integration, edits/deletes, realtime chat, search, filtering, or pagination are implemented. The family-specific translation prompt identified earlier remains a separate voice-pipeline follow-up; this task does not edit the teammate's pipeline.

## Verification

Run:

```powershell
pnpm.cmd exec tsc --noEmit
node --test tests/nooks.test.cjs tests/voice.test.cjs tests/memories.test.cjs
pnpm.cmd build
```

Implementation verification passed: TypeScript compilation, production build, 14 existing Nooks tests, 20 existing voice tests, and 15 new memory tests (49 total). The existing middleware-deprecation and browser-mapping-age build warnings remain. No lint script is configured.

The memory suite exercises actual routes, service functions, shared validation, membership guards, and scoped Drizzle SQL using scripted query results. The database client and session lookup are mocked; no Neon connection or successful provider call occurs. Declared schema checks and foreign keys are inspected, not executed against PostgreSQL. The scripted rollback test verifies the service's transaction boundary; PostgreSQL transaction/lock behavior still needs manual or isolated-database integration testing. No live Neon testing is claimed.

## Exact generated migration SQL

The migration is `lib/db/migrations/0003_memory_backend.sql`, accompanied by `meta/0003_snapshot.json` and an appended migration journal entry. It creates four tables, eight foreign keys, three chronological indexes, two unique constraints (with backing indexes), and thirteen CHECK constraints. Every pre-existing table, column, constraint, historical migration, and data row is preserved. Review the exact SQL below before manually authorizing execution.

```sql
CREATE TABLE "artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"nook_id" integer NOT NULL,
	"creator_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text,
	"media_storage_key" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artifacts_id_nook_unique" UNIQUE("id","nook_id"),
	CONSTRAINT "artifacts_type_check" CHECK ("artifacts"."type" IN ('photo', 'audio', 'letter', 'text', 'other')),
	CONSTRAINT "artifacts_title_check" CHECK (char_length(btrim("artifacts"."title")) > 0),
	CONSTRAINT "artifacts_description_check" CHECK ("artifacts"."description" IS NULL OR char_length("artifacts"."description") <= 10000),
	CONSTRAINT "artifacts_media_key_check" CHECK ("artifacts"."media_storage_key" IS NULL OR (
    char_length("artifacts"."media_storage_key") BETWEEN 1 AND 1024
    AND "artifacts"."media_storage_key" ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$'
    AND "artifacts"."media_storage_key" !~ '(^|/)[.]{1,2}(/|$)'
    AND "artifacts"."type" <> 'text'
  ))
);
--> statement-breakpoint
CREATE TABLE "contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"artifact_id" integer NOT NULL,
	"author_id" integer NOT NULL,
	"type" varchar(20) NOT NULL,
	"content" text,
	"audio_storage_key" text,
	"original_transcript" text,
	"source_language" varchar(35),
	"processing_status" varchar(20),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contributions_type_check" CHECK ("contributions"."type" IN ('text', 'audio')),
	CONSTRAINT "contributions_content_check" CHECK ((
    "contributions"."type" = 'text' AND "contributions"."content" IS NOT NULL
    AND char_length(btrim("contributions"."content")) BETWEEN 1 AND 20000
    AND "contributions"."audio_storage_key" IS NULL AND "contributions"."original_transcript" IS NULL
    AND "contributions"."source_language" IS NULL AND "contributions"."processing_status" IS NULL
  ) OR ("contributions"."type" = 'audio' AND "contributions"."content" IS NULL)),
	CONSTRAINT "contributions_audio_key_check" CHECK ("contributions"."audio_storage_key" IS NULL OR (
    char_length("contributions"."audio_storage_key") BETWEEN 1 AND 1024
    AND "contributions"."audio_storage_key" ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$'
    AND "contributions"."audio_storage_key" !~ '(^|/)[.]{1,2}(/|$)'
  )),
	CONSTRAINT "contributions_language_check" CHECK ("contributions"."source_language" IS NULL OR "contributions"."source_language" ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$'),
	CONSTRAINT "contributions_status_check" CHECK ("contributions"."processing_status" IS NULL OR "contributions"."processing_status" IN ('draft', 'pending', 'processing', 'completed', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"nook_id" integer NOT NULL,
	"sender_id" integer NOT NULL,
	"content" text NOT NULL,
	"artifact_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "messages_content_check" CHECK (char_length(btrim("messages"."content")) BETWEEN 1 AND 5000)
);
--> statement-breakpoint
CREATE TABLE "translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"contribution_id" integer NOT NULL,
	"source_language" varchar(35) NOT NULL,
	"target_language" varchar(35) NOT NULL,
	"translated_text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "translations_contribution_languages_unique" UNIQUE("contribution_id","source_language","target_language"),
	CONSTRAINT "translations_source_language_check" CHECK ("translations"."source_language" ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$'),
	CONSTRAINT "translations_target_language_check" CHECK ("translations"."target_language" ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$'),
	CONSTRAINT "translations_text_check" CHECK (char_length(btrim("translations"."translated_text")) > 0)
);
--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_nook_id_teams_id_fk" FOREIGN KEY ("nook_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_creator_id_users_id_fk" FOREIGN KEY ("creator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_artifact_id_artifacts_id_fk" FOREIGN KEY ("artifact_id") REFERENCES "public"."artifacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_nook_id_teams_id_fk" FOREIGN KEY ("nook_id") REFERENCES "public"."teams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_artifact_nook_fk" FOREIGN KEY ("artifact_id","nook_id") REFERENCES "public"."artifacts"("id","nook_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "translations" ADD CONSTRAINT "translations_contribution_id_contributions_id_fk" FOREIGN KEY ("contribution_id") REFERENCES "public"."contributions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "artifacts_nook_created_idx" ON "artifacts" USING btree ("nook_id","created_at","id");--> statement-breakpoint
CREATE INDEX "contributions_artifact_created_idx" ON "contributions" USING btree ("artifact_id","created_at","id");--> statement-breakpoint
CREATE INDEX "messages_nook_created_idx" ON "messages" USING btree ("nook_id","created_at","id");
```
