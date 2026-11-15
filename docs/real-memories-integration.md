# Real memory frontend integration

## Baseline and scope

Stayed on `feat/mvp-integration`. The working tree was clean before editing. Fetched `origin/main` and fast-forwarded this branch from `2de2be0` to `4a060b9`; no merge commit or feature branch was created. Existing real messaging and private storage implementations were preserved.

This pass changes frontend presentation, browser API adapters, tests, and documentation only. It does not change server routes, database models/migrations, origin validation, account authentication, storage configuration, environment files, deployment configuration, recorder behavior, or voice processing. Locked dependencies were restored with `pnpm install --frozen-lockfile` because local `node_modules` was incomplete; package declarations and the lockfile were not changed.

## Connected workflows

### Create Memory

- Real Nooks have an **Add Memory** link to `/circles/{numericNookId}/memories/new`.
- The route requires the existing authenticated server session and verifies Nook access before rendering the form. Component state is keyed by account and Nook.
- Photo, Written Memory (`text`), and Letter (`letter`) are supported. Titles use the existing 1–200-character schema; descriptions/bodies allow up to 10,000 characters. Photo descriptions are optional; written memories and letters require a nonblank body in the frontend.
- Only `type`, `title`, and `description` are posted to the existing artifact endpoint. Creator identity and persistence fields are never supplied by the browser. HTTP 201 and matching numeric resource identities are required before success. A ref lock prevents duplicate pending submissions.
- Written creation shows confirmed success and a link to the new details page. Photo creation retains the confirmed artifact before attempting upload, then navigates to details after a confirmed attachment result. Relevant account-scoped artifact caches are refreshed.
- Unknown creation outcomes are not automatically retried. Drafts remain available and users are directed to check their Nook first, because the backend has no creation idempotency contract.

### Private photographs

- Supports JPEG, PNG, and WebP between 16 and **5,000,000 bytes**, using the existing backend limit. HEIC, GIF, and SVG are rejected. Local previews use object URLs that are revoked when replaced or unmounted.
- Calls the existing `uploadPrivateMedia` utility only with the confirmed numeric artifact path. No separate upload implementation or storage credentials were introduced.
- If upload fails, the artifact ID is retained and retry operates on that same artifact. The retry first reads the authorized artifact: if media is already attached (including a lost completion acknowledgment), it directs the user to verify the existing photograph rather than automatically replacing it.
- A successful `cleanupPending` result is treated as attached media, not as a reason to upload again. The creation page also offers a details link after partial success.
- A missing photograph can be attached from details by its creator or the Nook owner. This frontend control supplements existing server authorization; other members are read-only. General artifact/media replacement, editing, and deletion were not added.
- Photos and audio use same-origin authenticated `/media` URLs, never opaque storage keys or provider URLs. Private photo failures show a neutral unavailable state. Native audio controls support seeking through existing backend Range responses, without invented durations or waveforms.

### Memory Details and perspectives

- `/circles/{numericNookId}/memories/{numericArtifactId}` uses the existing server session guard. Mixed numeric/fixture IDs are rejected. Existing demo slug routes and sample voice previews remain separate and unchanged.
- Reads Nook, artifact, memberships, and contributions using the existing account-scoped SWR helper. Child reads wait for verified parent identities. Read/access errors suppress cached private memory content rather than falling back to fixtures.
- Shows actual title, type, creator attribution, created date, photo/audio attachment, and long-form story with preserved line breaks. Names resolve through authorized membership `userId`, not membership IDs; absent historical members have neutral attribution. Member emails are not displayed.
- **Add your perspective** has a review step and posts only `{ type: 'text', content }`, using the existing 20,000-character schema. Confirmed HTTP 201 clears the draft and refreshes perspectives. Failed writes retain the draft, and a synchronous lock prevents duplicate pending submissions. The backend owns author attribution.
- Original voices show only actual audio contributions, actual storage availability, original transcripts/source language when returned, and real processing status. Missing recordings/transcripts are explicit. No synthetic translation, AI processing, recording creation, or audio persistence was added.

### Bookshelf and group sharing

- Real bookshelf cards now link to numeric Memory Details and show private photo thumbnails when attached. Search, type filters, newest/oldest sorting, arched bookshelf styling, real dates, and singular/plural member labels are preserved. No contribution counts or per-card metadata requests were added.
- **Share in group conversation** offers an editable default message and sends ordinary Nook-wide text with the actual numeric `artifactId`, through the existing authenticated message adapter. It requires a confirmed message response before reporting success and refreshes the account-scoped message cache. There are no recipients, request statuses, DMs, or voice attachments.
- `RealConversation` fetches the artifact list only if verified message history actually contains a memory reference. Plain-text conversations do not fetch artifacts. Linked messages use verified same-Nook artifact metadata to link back to details; missing/inaccessible artifacts have neutral unavailable text. Manual refresh preserves metadata revalidation when needed.

## Contracts reused

- `lib/memories/types.ts`: artifact, contribution, and message schemas and response envelopes.
- `lib/media/types.ts`: existing image limit and completion contract.
- `lib/frontend/media-client.ts`: direct private upload initiation, storage POST, and authenticated completion.
- Existing Nook read/membership contracts, session guard, SWR conventions, sign-out cache clearing, and message POST adapter.
- Existing GET/POST artifact and contribution routes and authenticated artifact/contribution media GET routes. No API contract changes were required.

The backend does not expose persisted translations through a complete authorized read contract. That integration and persistent voice processing remain with the teammate. Artifact creation and storage finalization remain separate operations, with no distributed transaction or idempotency guarantee.

## Files

Created:

- `app/(library)/circles/[circleId]/memories/new/page.tsx`
- `components/solibra/create-memory.tsx`
- `components/solibra/real-memory-details.tsx`
- `components/solibra/photo-attachment.tsx`
- `components/solibra/private-recording.tsx`
- `components/solibra/use-confirmed-write.ts`
- `components/solibra/real-memories.css`
- `lib/frontend/real-memories.ts`
- `tests/real-memories.test.cjs`
- This documentation.

Updated:

- `app/(library)/circles/[circleId]/memories/[memoryId]/page.tsx`
- `app/(library)/layout.tsx`
- `components/solibra/real-nook.tsx`
- `components/solibra/real-conversation.tsx`
- `tests/real-nooks.test.cjs`
- `tests/real-messages.test.cjs`
- `docs/real-messaging-integration.md`

## Verification

- `pnpm exec tsc --noEmit`: passed.
- `node --test tests/*.test.cjs`: **129 passed, 0 failed**. Includes account/profile, Create Nook, real Nooks, real messages, frontend phase two, Nooks/memories backend, media, voice, and 12 new real-memory tests.
- `pnpm build`: passed; existing middleware-deprecation and baseline-browser-mapping-age warnings remain.
- `git diff --check`: passed.
- Automated tests use controlled mocks, not Neon/storage writes. Coverage includes strict numeric/payload/201 acknowledgment rules; title/body/photo limits; text/letter creation; photo partial success and retry on the same ID; already-attached recovery and cleanupPending; confirmed-write locking and late unmounts; object-URL cleanup; authorized attribution; private media URLs; absent recordings/transcripts; creator/owner attachment controls; cached-content suppression; review/failed-draft retention; numeric linked sharing; demo routing; and conditional conversation artifact requests.
- Browser testing used the normal authenticated development server on `http://localhost:3000`, with read-only existing Nook data. Verified Library door opening → real Nook → Add Memory, correct `1 member`, and the empty shelf. Create Memory was checked at **320px**, **390×844**, and **1440px desktop** widths without horizontal overflow. Switching written-memory/letter choices preserved multiline local drafts. The mobile Save/Cancel controls scrolled above bottom navigation. Drafts were cleared and nothing was submitted.

## Manual verification still required

No approved writable development Nook/storage configuration was established during this pass. No real artifacts, uploads, contributions, or shared messages were created. Therefore automated success does **not** verify live Neon persistence, bucket CORS, media decoding/seeking, or cross-account visibility.

In an approved development environment:

1. Create text/letter memories and a photo; verify HTTP 201 IDs, Library/Nook cache refresh, details, and reload persistence.
2. Test browser upload CORS and authenticated photo retrieval. Interrupt upload/finalization and confirm retry checks the same artifact, including a lost acknowledgment. Verify owner/creator permission and nonmember denial without changing bucket settings.
3. Have another member read the memory, add a perspective, reload, and share it in the group conversation; verify the numeric link returns to that memory.
4. Check actual saved audio playback, seeking, unavailable recordings, real processing status/transcripts, and physical mobile keyboards/accessibility.
5. Check populated real Details layouts at 320px, 390px, and desktop widths, plus account switching and live membership revocation. This browser session had an empty real shelf; populated real Details were tested with mocked rendering rather than live records.

Normal local preview: `http://localhost:3000`. Open a real Nook and choose **Add Memory**. The current signed-in preview account can use `http://localhost:3000/circles/5/memories/new`. This is local to the user's Mac, not a deployed/public preview. The server is left running on loopback; no voice-auth bypass is used.

No commit, push, merge commit, deployment, environment/storage changes, or migration was performed.
