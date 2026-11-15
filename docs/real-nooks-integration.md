# Real Library and Nooks — integration phase 1

## Baseline and boundaries

Created `feat/real-nooks-integration` from fetched `origin/main` at `faf0c1d14027fe1f849bf0e5fcf3c2c9528df55c`. The starting working tree was clean. Reviewed Nooks/memories contracts, service permissions, existing Library/windows/interior/description/profile/Create Nook/shell and fixtures.

No API route, backend service, schema, migration, authentication action, middleware, environment, upload/storage, voice pipeline, dependency or deployment configuration changed. No commits, pushes, merges, deployments, migrations or live database mutations were performed.

## Connected functionality

- Authenticated `/` uses GET `/api/nooks` scoped by the verified account ID. It displays actual names/descriptions/membership roles; no fixture fallback exists. All Nooks includes every membership; Shared with me filters `nook.role === 'member'`; Recent sorts by `updatedAt`, falling back to `createdAt`, with an explicit explanation that this is not visit history. Search covers name/description. User greeting uses the authenticated account name. Loading, errors, empty, no-shared-results and signed-out states are distinct.
- `NookWindow` accepts either a backend `Nook` or a demo `SampleCircle` through distinct props. Real windows retain the solid pink doors and existing animation, show role/private status, and use neutral empty shelves behind the doors. No fake category, counts, last-visit history, door color or photograph is attached to an API record. There are no per-window member/artifact requests.
- `/circles/[circleId]` validates numeric IDs and verifies the existing session server-side before rendering real data. It reads GET `/api/nooks/:id`, then members/artifacts only after a successful Nook response. Access/read errors do not become fake empty Nooks or expose stale cached details. Invalid IDs return not found; nonmembers/nonexistent resources retain the backend's non-enumerating unavailable behavior.
- Real interiors retain the existing title/description area, member strip, search/type/sort toolbar and arched architectural bookshelf. Shelves show artifact text metadata or a warm empty state. Storage keys are not displayed, media is not rendered and no memory-creation action is introduced. Existing fixture photographs/people are not rendered in real Nooks.
- Owner description editing uses `UpdateNookRequest` and PATCH `/api/nooks/:id`. The existing editor retains failed drafts; API response updates detail and refreshes the authenticated Nook list. Permission failures trigger membership/detail revalidation; member views remain read-only. External description updates reset the editor's local display override.
- Members and member counts come from the authorized membership response, retaining membership ID versus user ID distinctions. Initials avatars and existing member cards are reused. Member emails are not displayed; private member profiles require the existing authorized backend read.
- Library invitation inbox uses only GET `/api/nook-invitations` before acceptance. It shows invitation reference, role and date, without retrieving private Nook name/description or profiles. POST acceptance uses the numeric Nook/invitation IDs and the existing authenticated contract. It guards repeat clicks, reports errors/success, refreshes inbox and account-scoped Library/Profile Nook lists, and provides an entry link after confirmed acceptance. There is no Decline action or email-delivery claim.
- Owner invitation management opens on demand in a real owner Nook. It reuses the extracted Create Nook invitation queue and existing POST adapter, including normalized email validation, duplicate guards, pending queue removal, individual retries and confirmed status. Owner GET invitations is loaded only on opening this section, and refreshed after completed batches. No duplicate server implementation was added.
- Create Nook keeps its existing four steps, colors, animation and API acknowledgment. Confirmed creation invalidates/revalidates the appropriate Nook-list cache and final Ready offers Enter Nook. The previous fixture-Library warning is removed. Invitation retries never recreate the Nook; selected door color remains preview-only and real windows default to pink.
- Profile memberships now link to real numeric Nook interiors while retaining its private member presentation and inline account editing.
- Global Messages now targets `/messages`, a session-protected real-Nook selection screen. It explicitly says messaging integration is a later phase and links to the actual Nook. No unrelated Rivera conversation is selected for an authenticated user. Conversation-specific mobile header behavior is preserved only on actual conversation routes.
- Notifications navigate to the Library invitation inbox. Library/Messages/You destinations remain consistent.

## Demo separation

The sample Library is now `/demo`, with a prominent fictional-content label. Existing slug Nook pages remain reachable for compatibility but display a Demo Nook label. Fixture memory details display a Demo memory label; fixture conversations use a Demo Nook title. Demo routes never pass slug IDs to real APIs.

`DemoLibrary`, sample `NookInterior`, fixture mode in `Bookshelf`/`NookWindow`, sample Memory Details, Family Messages, sample Recent Additions and temporary voice contribution previews remain demo-only. The authenticated Library does not display sample activity. Cross-Nook recent-memory activity, full messaging, memory creation/media and voice persistence are not integrated here.

## Cache and error handling

New private reads use `[resource URL, viewerId]`, matching the existing account-scoping convention. List refreshes target that viewer's Nook-list keys. A 401 prompts sign-in; 403 explains permission failure; 404 treats nonexistent and inaccessible Nooks alike; 409 invitation conflicts prompt refresh; network/unconfirmed-write errors advise checking before explicitly retrying. No mutation is automatically retried.

Existing sign-out actions clear private SWR data and refresh routing. The library demo provider is keyed by account identity so its temporary audio/state also clears on sign-out/account changes, while normal in-layout navigation retains drafts. Existing backend authorization remains authoritative for every private read and mutation.

## Changed files

Routes/layout: Library page/layout, numeric-or-demo Nook page, demo Library route, Messages selector route, fixture conversation/memory labels, and authenticated Create Nook entry.

Components: real Library, preserved DemoLibrary, real-Nook interior, invitation inbox/shared queue, Messages selector, scoped request-state/hook, window/bookshelf reuse, description editor cache handling, Create Nook journey, Profile entry links, shared navigation and scoped CSS.

Frontend helpers: `lib/frontend/real-nooks.ts`, `nook-api.ts`, `nook-cache.ts`. Browser-safe backend `Nook`, membership, invitation, update/accept and artifact response types are reused; no backend data model was duplicated.

Tests: added `tests/real-nooks.test.cjs`, extended Create Nook cache/entry coverage, updated the Profile expectation to allow actual numeric entry URLs.

## Verification

- `pnpm exec tsc --noEmit`: passed.
- `node --test tests/account-profile.test.cjs`: 9 passed.
- `node --test tests/create-nook.test.cjs`: 9 passed.
- `node --test tests/frontend-phase-two.test.cjs`: 8 passed.
- `node --test tests/nooks.test.cjs`: 16 passed.
- `node --test tests/memories.test.cjs`: 15 passed.
- `node --test tests/real-nooks.test.cjs`: 9 passed.
- `pnpm test:voice`: 20 passed.
- `pnpm build`: passed. Existing middleware-convention and stale browser-baseline warnings remain.
- `git diff --check`: passed; protected backend/storage/voice/deployment paths have no changes.

Focused tests use controlled responses and hook/render harnesses: owned/shared filtering, real timestamp sort, slug rejection, default real windows with no fake counts/assets, authenticated versus signed-out Library, failed reads without fixture fallback, owner versus member controls, real member counts/artifact metadata, inaccessible cached detail suppression, numeric authenticated PATCH/accept payloads, distinct errors, account-scoped reads/refreshes, guarded acceptance and cache refresh, draft retention/permission loss, confirmed creation refresh plus numeric entry and no recreation.

Actual browser checks: signed-out Library at 320×844, 390×844 and 1440×1000 without horizontal overflow; official header/navigation preserved; `/demo` labeling visible; all three sample doors opened/closed; signed-out numeric Nook and `/messages` requests redirected to sign-in. Browser was signed out, so authenticated Library/interior mutations were not claimed as live-tested. Normal local development remains running at **http://localhost:3000/**; the explicit preview is **http://localhost:3000/demo**.

## Manual testing and remaining work

Use an approved development database and multiple real accounts to verify actual list privacy, create-to-Library appearance, owner description saves and member denial, member counts, intended-recipient discovery/acceptance and resulting membership, revoked/inaccessible Nooks, sign-out/account switching, authenticated mobile layouts and keyboard behavior. No production Neon mutations were run. The backend suites exercise controlled database/session behavior and do not replace live transaction testing.

No backend contract mismatch was found for this phase. The existing API deliberately lacks window category/color/count/visit metadata and an activity feed; those fields are not invented. Artifact API has private storage references rather than display URLs, so metadata-only rendering is intentional. Media uploads/storage, voice persistence, full conversation integration and new memory creation remain owned by their separate phases/teammate.

## Messaging follow-up

Real numeric Nooks now open persistent group conversations through `/messages/{nookId}`. See [Real Nook group messaging](./real-messaging-integration.md) for implementation boundaries, verification, and remaining live testing. The earlier phase's messaging-selector limitation is superseded by this follow-up; demo slug conversations remain separate.
