# Create Nook workflow

## Scope and design

Implemented on `feat/nook-profile-ui` from main `6041d40190207035af5ccfc12a4baf52ad8654ae`; the branch matched fetched main before changes and the working tree was clean. No backend, authentication, storage, schema, migration, environment, dependency, or deployment changes.

There are no dedicated Create Nook Figma frames. Inspected M01 (`4:8910`), D01 (`4:8909`), Archive window (`4:9134`), and its mobile closed component (`21:1862`) through Figma MCP. The workflow is a new extension of the established visual language, not a claim of frame fidelity. It reuses the existing layout/fonts, rose/cream/burgundy tokens, local mascot, buttons, and closed solid-door arch styling. The arch is decorative and does not persist a category/theme/cover or display unrelated sample memories.

## Files

- `app/(library)/nooks/new/page.tsx`: new route using the existing library layout.
- `components/solibra/create-nook.tsx`: four steps, form validation, draft/review state, confirmed-resource success, optional invitation queue and status feedback.
- `components/solibra/create-nook.css`: scoped responsive forms, progress, decorative arch, success/invitation presentation.
- `lib/frontend/nooks-client.ts`: reusable typed client adapter using existing browser-safe schemas and contracts, with defensive response validation.
- `components/solibra/library.tsx`: existing Create Nook button now links to `/nooks/new`.
- `components/solibra/shell.tsx`: Library remains the active destination during creation.
- `tests/create-nook.test.cjs`: adapter and component workflow tests using controlled responses and a hook harness, not live database writes.

## Actual API behavior

The form is wired to real APIs, not fake persistence. It creates an additional Nook via authenticated same-origin `POST /api/nooks`, only sending validated name and optional description (blank becomes null). It requires HTTP 201 and a valid `NookResponse` with a positive safe integer ID before showing “Your Nook is ready.” The signup-created initial Nook and signup behavior are unchanged.

Invitations require that confirmed ID, use `POST /api/nooks/:nookId/invitations` and `InviteNookMemberRequest` with role `member`, and validate the `NookInvitationResponse` association. Email addresses are normalized for case-insensitive queue deduplication. Queued addresses can be removed before submission. Completed invitations remain listed as pending and are excluded from retries. Individual failed invitations can be retried without creating another Nook, and Finish remains available after failures. No UI claims emails were sent. Invitation delivery/inbox screens are not implemented.

Submission refs prevent rapid duplicate activations before React rerenders. There are no automatic retries. Standard error responses preserve draft fields or the successfully created Nook; 401 offers sign-in in a separate tab to preserve local state. Network timeouts (30 seconds), malformed success responses, or server failures may have an ambiguous write outcome. Error feedback tells users to check before explicitly retrying. The API has no idempotency key contract, so client guards cannot guarantee exactly-once creation after a transport failure or reload. Future resource-list integration should reconcile ambiguous results; do not infer success from an error or silently resend.

## Real resources versus fixtures

The success screen displays the real name/description and numeric reference. It never links that ID to `/circles/[id]`, since those interiors currently resolve fixture strings. Returning to Library does not insert a pretend fixture or claim the real Nook is visible there. The workflow's in-memory display/queue clears on refresh or leaving the route; confirmed backend Nooks/invitations remain persisted. There are no localStorage writes or guessed memory/artifact endpoints.

Remaining integration: connect Library to authenticated GET `/api/nooks`; map actual numeric resources to real Nook interiors and membership roles; connect invitation inbox/acceptance UI separately. The server remains authoritative for session ownership, permissions and membership. Do not use `/api/user.role` as Nook authorization. The existing Nooks contracts support this workflow without backend changes; no contract blocker was found.

## Verification

- `pnpm exec tsc --noEmit`: passed.
- `pnpm test:voice`: 20/20 passed.
- `node --test tests/frontend-phase-two.test.cjs`: 8/8 passed.
- `node --test tests/nooks.test.cjs`: 14/14 passed.
- `node --test tests/create-nook.test.cjs`: 4/4 passed. Checks blank/overlong names and descriptions, optional descriptions, cancel destination, retained Back fields, rapid duplicate submission prevention, creation errors, duplicate/invalid emails, queue removal, retry without Nook recreation, finish/skip, authenticated request payloads, exact 201 handling, invalid IDs, mismatched invitation response and unknown transport outcomes.
- `pnpm build`: passed, including `/nooks/new` alongside existing frontend and API routes. Existing middleware-deprecation and stale baseline-data warnings remain.
- Browser checked name/review screens at 320×844, 390×844 and 1440×1000 without horizontal overflow; verified inline blank/overlong name errors, entry/review/Back data, Cancel to Library, Library Create Nook link, and existing door → Nook navigation with all six shelf artifacts. Only the name/review screens were inspected visually; success/invitation state transitions were exercised with the controlled component test harness.

No live creation/invitation API calls were executed: an approved writable development environment was not identified. Authenticated success/failure paths, backend membership enforcement with real accounts, all success/invitation layouts, screen-reader behavior and real mobile keyboard behavior still need manual testing in an approved development environment. Do not submit creation against the configured database until that environment is approved. No migrations, commits, pushes, merges or deployments were run.

The existing normal loopback development server remains available at http://127.0.0.1:3000/nooks/new for manual inspection; it uses the existing environment and was not replaced with the voice-bypass launcher.
