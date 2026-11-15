# Persistent Nook colors, audio messages and recording finalization

This change reuses Oregon PostgreSQL, the existing private Ohio `solibra-private` bucket, session/Nook authorization, ElevenLabs and Gemini. No fonts, typography settings, dependencies, environment files, connection strings, cloud resources or billing settings were changed. No migration was applied; no commits, pushes or merges were performed.

## Nook colors

`teams.door_color` is required, defaults to `pink`, and has a database CHECK allowing exactly the existing five identifiers. Existing Nooks become pink; each Nook has its own independently saved value. The original door swatches are preserved:

| Identifier | Door fill | Door trim |
| --- | --- | --- |
| pink (default) | `#ffdbda` | `#f49cbb` |
| lilac | `#e4d6f4` | `#b49acb` |
| blue | `#d4e6f4` | `#93b5cf` |
| green | `#dce8d4` | `#9db58b` |
| yellow | `#fae9bc` | `#d2b779` |

The existing `NOOK_DOOR_COLORS` module supplies request validation and creation controls. POST `/api/nooks` accepts `{"name":"Our stories","doorColor":"blue"}`. Omission remains valid for older clients and defaults pink. GET `/api/nooks` and GET `/api/nooks/{nookId}` return `nook.doorColor`; PATCH `/api/nooks/{nookId}` accepts `{"doorColor":"green"}` for owners only. Invalid colors are rejected. The existing creation workflow now sends the selection and its confirmation copy reflects persistence. Library/conversation Nook windows use the saved value. The existing owner editor only edits descriptions, so no new color editor or redesign was added; owner color updates are available through PATCH.

## Message model and API

Messages remain messages, never fabricated artifacts or contributions. Existing content remains NOT NULL for compatibility; audio-only messages use an empty string. New fields are `type` (text by default), `audio_storage_key`, `original_transcript`, `source_language`, `processing_status`, and `updated_at`. Existing message IDs, content, artifact references, senders, Nooks and creation timestamps are unchanged. New CHECK constraints validate content, type/state, keys, language and processing status. The existing chronological message index is retained.

`message_translations` has its own real message FK (cascade on message deletion), primary key, language/text checks and unique `(message_id, source_language, target_language)` index. Contribution translations retain their original relationships.

POST `/api/nooks/{nookId}/messages` still accepts `{"content":"Hello"}`. It also accepts `{"type":"audio"}` or `{"type":"audio","content":"Listen to this"}`. An optional artifact reference must still belong to this Nook. Responses and GET message history include this browser-safe structure:

```json
{
  "message": {
    "id":30,"nookId":10,"senderId":1,"type":"audio","content":"",
    "artifactId":null,"audioUrl":null,"originalTranscript":null,
    "sourceLanguage":null,"processingStatus":"draft",
    "createdAt":"2026-11-15T00:00:00.000Z","updatedAt":"2026-11-15T00:00:00.000Z"
  }
}
```

After finalization, `audioUrl` is an authenticated `/api/nooks/10/messages/30/media?v=...` application URL. Private storage keys are omitted from message responses. The optional fields in the shared TypeScript `Message` contract preserve compatibility with older client fixtures/responses; new server records include the fields. New processing/translation types are in `lib/messages/types.ts`.

### New endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/nooks/{nookId}/messages/{messageId}/media` | Authorize a direct private staging upload. |
| POST | `/api/nooks/{nookId}/messages/{messageId}/media/complete` | Verify an immutable copy and attach it. |
| GET | `/api/nooks/{nookId}/messages/{messageId}/media` | Stream private audio, supporting a single HTTP byte range. |
| DELETE | `/api/nooks/{nookId}/messages/{messageId}/media` | Remove the recording and invalidate generated text. |
| POST | `/api/nooks/{nookId}/messages/{messageId}/process` | Transcribe attached audio if needed, translate and persist. |
| POST | `/api/nooks/{nookId}/messages/{messageId}/translations` | Translate the saved transcript without reuploading/retranscribing. |
| GET | `/api/nooks/{nookId}/messages/{messageId}/translations` | Read persisted translations. |

All use the existing signed-session and origin checks. Current members may create messages/read media, transcripts and translations. Only the sender or a current Nook owner may manage attachments/process/retry. Every operation verifies the message belongs to the requested Nook. Removed members and unrelated users cannot use known IDs or object keys to bypass authorization. Existing owner/member permissions remain unchanged.

## Private upload, playback and processing

The existing frontend upload helper now also accepts the exact numeric message media path. Other Nook media contracts are unchanged. Initiation JSON is `{"contentType":"audio/webm","byteSize":123456}`. The response retains Task 4's `{upload:{url,method,fields,uploadToken,expiresAt,contentType,byteSize}}` structure. Send every returned field as multipart to the signed URL, with the file last and no app cookies. Finalize with `{"uploadToken":"..."}`; expect `{media:{url,contentType,byteSize},cleanupPending:false}`.

Upload policies are exact-key/type/size, 120 seconds; completion tickets are user/Nook/message/version bound, expire after five minutes, and use a different signing key/audience from artifact/contribution uploads. Keys use `nooks/{nookId}/messages/{messageId}/{staging|objects}/{uuid}.{extension}`. No arbitrary storage key or external URL is accepted. MIME, size and actual container signatures are checked. Supported stored audio types remain WebM, MP4/M4A, Ogg, WAV, MP3 and AAC; the 4 MiB limit is unchanged. Images cannot attach to an audio message.

Playback streams through the authenticated app route with private/no-store caching, Cookie variance, safe type/nosniff headers and Range support. Completion publishes a verified server-only copy, so replaying a staging POST cannot overwrite current audio. A stale completion returns 409. Replacement/deletion transactionally clear source text, language, processing state and message translations; new attachments start draft. Version/key checks prevent in-flight AI results from being saved against changed audio. Cleanup after replacement is best effort and signaled by `cleanupPending`.

Deletion uses Task 4's existing storage-first safety convention: storage failure leaves the DB reference for retry; if object deletion succeeds but DB commit fails, retry authorized DELETE to reconcile the reference. No silent success is returned for that case. An empty DELETE also advances the version to invalidate outstanding upload tickets. Failed/abandoned uploads may leave private orphan objects; there is no paid cleanup worker.

Processing is explicit, never automatic on upload. POST process with `{"targetLanguage":"en"}` (optional `reprocess:true` only to intentionally retranscribe). It loads the complete verified object through the server adapter, with no app-cookie forwarding or second browser upload. POST translations uses `{"targetLanguage":"fr"}`. Success is `{message,translation,cached}`; a translation contains `id`, `messageId`, `sourceLanguage`, `targetLanguage`, `translatedText`, and ISO `createdAt`. GET translations returns `{translations:[...]}`.

The shared `createVoicePersistence` engine retains Task 5's three-minute lease, current permission checks before persistence, key/version checks, normalized language aliases, unknown-source `und`, transcript length validation and translation upsert/cache behavior. External AI calls run outside DB transactions. Repeated languages return `cached:true`; changing target language reuses saved source text. Translation failure returns a non-2xx `{error,stage:"translation",status,message}` and preserves successful transcription. The UI refreshes that partial result and offers translation-only retry. A fresh overlapping uncached request returns 409. Hard-terminated requests can be retried after lease expiry. No background queue, billing upgrade or provider retry loop is introduced.

## Conversation integration

The existing conversation now has a microphone control below its text composer. It uses the shared recorder, preview, send, retry and discard controls. It creates one audio-message draft, then uploads the finalized Blob directly to storage. Upload failures retain the draft ID and recording for retry instead of creating another message. An uncertain create response requires checking history/discarding before another creation attempt. Failed or discarded uploads can leave an empty audio draft in history; authorized users can attach a recording through its replacement control. A sent recording is cleared before refreshing history so refresh failure cannot resend it.

Audio bubbles use the existing native private player. Source text, detected language, language selection, saved translations, loading/errors and explicit process/retry controls are shown without changing the conversation's typography. Ordinary members select/read existing translations; senders/owners may generate missing ones. Sender/owner controls also support replacement and removal. Replacing/removing clears old generated text on refresh. There is no real-time push; refresh fetches current messages and persisted translations.

## Recording investigation and fix

There was no six-second constant in capture, upload, full-object loading, Range validation or provider input. `MediaRecorder.start(1000)` was already a timeslice; chunks were already accumulated and the Blob assembled in `onstop`.

Two concrete defects were identified: normal stop released microphone tracks immediately, before the final `dataavailable`/`onstop` lifecycle finished; and streamed Chrome WebM lacked a finite duration header. Native/custom players can then report misleading durations or seekability. Chrome baseline tests produced `Infinity` metadata and, in an initial run, a shortened tail. The exact reported six-second cutoff was **not reproduced**, so it is not claimed as a universally confirmed root cause. A user recording that still truncates needs the live byte/Range checks below.

Normal stop now keeps tracks alive until `onstop`, retaining all chunks and the final event. A dependency-free WebM finalizer writes `Info.Duration` in TimestampScale ticks, leaving encoded audio blocks unchanged. It only handles the minimal unindexed MediaRecorder layout; unsupported/indexed/malformed containers pass through rather than risking corruption. MP4 and other containers are unchanged. Metadata follows the [Matroska element specification](https://www.matroska.org/technical/elements.html) and [timestamp rules](https://www.matroska.org/technical/notes.html).

The shared recorder requests 64 kbit/s spoken audio, retains Chrome Opus WebM/Safari MP4 selection, and caps recording at **120 seconds**, subject to **4 MiB**. Browser bitrate requests are advisory; if a browser produces oversized audio, the whole recording is rejected with a clear error, never trimmed to fit. Size is checked after finalization too. Generation checks prevent a discarded or old asynchronous finalization from replacing a newer recording. Temporary URLs remain until discard/replacement/unmount.

Real isolated Chrome tests used local synthetic audio, the actual hook, real MediaRecorder, decodeAudioData, metadata loading and accelerated complete playback. Results:

| Requested | Decoded audio | Metadata / played endpoint | Final bytes |
| --- | --- | --- | --- |
| 10 s | 9.960 s | 10.012 s | 80,992 |
| 30 s | 29.940 s | 30.016 s | 243,150 |
| 60 s | 59.880 s | 60.021 s | 486,128 |
| 120 s | 119.820 s | 120.000 s | 972,639 |

Small differences reflect encoder/capture scheduling; none stopped near six seconds. Baseline 10 s WebM had infinite metadata. These tests prove browser capture/container/playback behavior, not live Neon storage, microphone quality or AI transcription quality. No bucket writes or provider calls were made. Safari hardware/browser tests remain manual. Old stored recordings are not automatically rewritten; rerecord/reupload if they have bad metadata. The existing standalone voice page and demo story recorder use this same hook. Current real Create Memory/perspective screens do not expose a separate audio recorder; existing audio attachment/backend paths are preserved, not redesigned by this task.

## Postman and browser testing after migration approval

1. Apply the reviewed migration to the verified Oregon development branch yourself (instructions below). Sign in as A, B and C using separate browser profiles/cookie jars. A/B share a Nook; C does not. Do not change `.env` or configure paid plans for testing.
2. Create a Nook with blue doors. Reload/logout/login and verify blue through GET and Library. B should see the same color. As owner A, PATCH green and verify both clients after refresh; as member B, PATCH must return 403. Invalid color `red` must return 400. Creating without color defaults pink.
3. Send a normal text message and a message with an artifact reference. Verify existing behavior. POST an audio-only message and retain its real message/Nook IDs. Initiate/finalize its upload using the exact file size as described above; preserve app cookies only for app requests.
4. As A and B, GET the media. Test `Range: bytes=0-1023` (206 and correct Content-Range/length), then a full GET. Full downloaded bytes should equal the finalized local Blob's bytes and size. As C or a removed B, both media and translation/history access must be denied. A message from another Nook must not be usable under this path. Owners may moderate; ordinary nonsenders cannot upload/delete/process.
5. As sender/owner, POST process targeting English. Reload history and GET translations to verify persistence. Repeat for `cached:true`; POST French translation without reuploading and repeat to confirm cache reuse. Use mocked failures rather than exhausting real quotas: verify partial transcription survives translation failure, and retry does not call ElevenLabs again.
6. Record 10, 30, 60 and (if size permits) 120 seconds in the conversation, including speech near the end. Preview all the way through, send, refresh and play again. Compare Blob size to upload metadata/full GET, and playback duration to elapsed time. Test Chrome and Safari where available. Check standalone/demo recording contexts using the same procedure. The absent real memory recorder UI is not a separate recording implementation to test.
7. Replace/remove an attachment; confirm text and translations clear. Automated tests pause AI work during replacement/deletion and reject late results. Start competing requests and expect 409 while leased. Test malformed containers and >4 MiB files; neither should attach.
8. Before live AI tests manually confirm existing free quotas/model eligibility. Stop if payment or upgrades are requested. Deployment function timeouts can still end processing before the application's 140-second deadline / 180-second declared route duration; retries recover from saved source text or lease expiry.

## Migration and safe manual application

New files: `0005_nook_colors_audio_messages.sql` and `meta/0005_snapshot.json`, plus a journal entry. Existing migrations/snapshots are unchanged. The SQL is reproduced below. Existing user, Nook, membership, invitation, activity, artifact, contribution and message records are preserved.

The app reads `POSTGRES_URL`, while the existing Drizzle config reads `DATABASE_URL`. Confirm in Neon that the app URL belongs to the intended **Oregon development branch**, not production or the Ohio media project. The migration runner cannot infer that intent from variable names. Apply before deploying/running this schema against authenticated application data.

From the project root, after approving the SQL, this PowerShell command sets DATABASE_URL equal to POSTGRES_URL **only in the child process**, checks that exactly migrations 0000–0004 are recorded with matching hashes, and runs Drizzle only if 0005 is the sole pending migration. It does not edit `.env`. If 0004 is still pending, stop and review/apply that separately first; do not reset or use push.

```powershell
@'
require('dotenv').config({quiet:true});
const postgres=require('postgres');
const {readMigrationFiles}=require('drizzle-orm/migrator');
const {execFileSync}=require('node:child_process');
(async()=>{
  if(!process.env.POSTGRES_URL)throw Error();
  process.env.DATABASE_URL=process.env.POSTGRES_URL;
  const local=readMigrationFiles({migrationsFolder:'./lib/db/migrations'});
  const sql=postgres(process.env.DATABASE_URL,{max:1,connect_timeout:10});
  try {
    const applied=await sql`SELECT hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at`;
    if(local.length!==6 || applied.length!==5 ||
      applied.some((row,i)=>Number(row.created_at)!==local[i].folderMillis || row.hash!==local[i].hash))throw Error();
  }finally{await sql.end();}
  execFileSync('cmd.exe',['/d','/s','/c','pnpm.cmd db:migrate'],{stdio:'inherit',env:process.env});
})().catch(()=>{console.error('Stopped. Verify target database and migration history before retrying.');process.exitCode=1;});
'@ | node
```

Do not paste the DDL manually and then run Drizzle without reconciling its ledger. Do not run setup, seed, reset or destructive cleanup commands. No such commands were executed for this implementation.

## File inventory and checks

New: message media/complete/process/translations route files; `lib/messages/{http,media,tickets,types,voice}.ts`; `lib/voice/{persistence-core,webm-duration}.ts`; `components/solibra/audio-message.tsx`; migration SQL/snapshot; `tests/{audio-messages,audio-message-ui,recording-duration}.test.cjs`; this guide.

Modified: schema and migration journal; Nook types/service; shared color module and creation client; Create Nook component/CSS; NookWindow; message types/service/client; private upload helper path validation; contribution persistence wrapper (same public contract); shared audio constants/recorder hook; conversation component and layout-only CSS; relevant Nook/create/message/recorder tests; package test script. No existing files were deleted.

The mocked suites cover authorization, scope, MIME/size, private/full/ranged playback, immutable upload completion, stale completion, partial failure/retry, persistence/cache, concurrent leases, invalidation, shared engine contribution regression, all-chunk/final-event preservation, WebM header preservation and UI read/manage controls. Real account/database persistence, deployed cross-region storage and live AI quality remain manual until migration approval. Existing middleware/browser-mapping build warnings are unrelated. No lint script is configured.

Completed verification: Next.js type generation, standalone TypeScript, production build, `git diff --check`, and all **189 automated tests passed**. The real Chrome capture/decode/playback results are recorded above. Browser/microphone hardware, Safari, real Neon writes and live ElevenLabs/Gemini calls were not exercised. The shared contribution processing contract continues passing its original tests.

## Exact generated SQL

```sql
CREATE TABLE "message_translations" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"source_language" varchar(35) NOT NULL,
	"target_language" varchar(35) NOT NULL,
	"translated_text" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_translations_languages_unique" UNIQUE("message_id","source_language","target_language"),
	CONSTRAINT "message_translations_source_check" CHECK ("message_translations"."source_language" ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$'),
	CONSTRAINT "message_translations_target_check" CHECK ("message_translations"."target_language" ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$'),
	CONSTRAINT "message_translations_text_check" CHECK (char_length(btrim("message_translations"."translated_text")) > 0)
);
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT "messages_content_check";--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "type" varchar(20) DEFAULT 'text' NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "audio_storage_key" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "original_transcript" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "source_language" varchar(35);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "processing_status" varchar(20);--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "teams" ADD COLUMN "door_color" text DEFAULT 'pink' NOT NULL;--> statement-breakpoint
ALTER TABLE "message_translations" ADD CONSTRAINT "message_translations_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_audio_state_check" CHECK (("messages"."type" = 'text' AND "messages"."audio_storage_key" IS NULL AND "messages"."original_transcript" IS NULL AND "messages"."source_language" IS NULL AND "messages"."processing_status" IS NULL) OR "messages"."type" = 'audio');--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_audio_key_check" CHECK ("messages"."audio_storage_key" IS NULL OR ("messages"."audio_storage_key" ~ '^[A-Za-z0-9][A-Za-z0-9_./-]*$' AND char_length("messages"."audio_storage_key") <= 1024 AND "messages"."audio_storage_key" !~ '(^|/)[.]{1,2}(/|$)'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_language_check" CHECK ("messages"."source_language" IS NULL OR "messages"."source_language" ~ '^[A-Za-z]{2,3}([_-][A-Za-z0-9]{2,8})*$');--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_status_check" CHECK ("messages"."processing_status" IS NULL OR "messages"."processing_status" IN ('draft','pending','processing','completed','failed'));--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_content_check" CHECK (("messages"."type" = 'text' AND char_length(btrim("messages"."content")) BETWEEN 1 AND 5000) OR ("messages"."type" = 'audio' AND char_length("messages"."content") <= 5000));--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_door_color_check" CHECK ("teams"."door_color" IN ('pink', 'lilac', 'blue', 'green', 'yellow'));
```

### Unfinished voice-message recovery

A message record is created before its private recording is attached. If upload fails, the composer retains the confirmed message ID and local audio for attachment retry. Discarding local audio does not delete the server record; the sender is told to refresh and use **Replace recording** on the unfinished message. Other members see an awaiting-recording notice. There is no draft-message deletion API, so abandoned records can remain. Uncertain message creation is never automatically retried. Closing the recorder stops capture while retaining its local preview.

Recording-limit labels use the shared two-minute / 4 MiB constants. Translation-read authorization failures hide cached private audio and text; ordinary translation errors continue to leave authorized playback available.
