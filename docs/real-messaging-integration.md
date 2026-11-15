# Real Nook group messaging

## Memory integration follow-up

Real Memory Details and creation are now connected. Conversation artifact metadata is fetched only for linked messages, and verified same-Nook labels open real numeric Memory Details. Sharing starts from Memory Details and sends a normal group text with an artifact ID. See [Real memory frontend integration](./real-memories-integration.md) for current scope and verification; the earlier metadata-only/deferred-attachment notes below describe the previous phase.

Implemented on `feat/mvp-integration` from main `35cbed0`. No server routes, permission rules, origin guards, database models, migrations, authentication, photo/media storage, voice pipeline, deployment configuration, or dependencies changed.

## Connected experience

- `/messages` lists authenticated Nook memberships and opens `/messages/{numericNookId}`. Real Nook interiors also link to their group conversation.
- Numeric conversation routes require the existing authenticated server session. Fixture slug conversations still use `FamilyMessages` and remain explicitly labeled demos, including their temporary story and voice previews.
- Real conversations reuse the existing desktop sidebar, conversation panel, Nook window, mobile header, viewport handling, and bottom navigation. The sidebar contains real Nooks rather than individual demo contacts.
- Messages use existing `MessageListResponse`, `MessageResponse`, and `CreateMessageRequest` contracts. Reads use the existing account-scoped SWR convention. Writes use the relative authenticated same-origin endpoint and require HTTP 201 with a valid matching message before clearing the draft.
- Text is trimmed, required, limited to 5,000 characters, and supports multiline composition. Enter sends; Shift+Enter inserts a newline. A synchronous submission lock prevents repeated sends while pending. Failed sends retain the draft. Unknown outcomes are never automatically retried; users are told to refresh before trying again.
- History is chronological and deduplicated by numeric message ID. Confirmed messages enter the cache only after acknowledgment, followed by revalidation. Manual refresh and ordinary SWR focus revalidation are supported; there is no polling, subscription, or instant-delivery claim.
- Outgoing attribution uses the authenticated user ID. Incoming names come from authorized memberships using `userId`, separately from membership IDs. Missing historical members have neutral attribution; member emails are not displayed.
- Nook, member, and history read errors hide cached private conversation content. Access-denied writes trigger revalidation. Route keys isolate account/Nook component state, and late write completions after unmount cannot populate another conversation. Existing sign-out cache clearing is preserved.
- Existing artifact references display same-Nook metadata labels only. Missing references are neutral. No attachment creation UI, photo rendering, or fake memory-detail links were added.
- Member counts now correctly display `0 members`, `1 member`, and `2 members` in real Nook and conversation views.

## Verification

- `pnpm exec tsc --noEmit`: passed.
- Account/profile, Create Nook, real Nooks, frontend phase two, Nooks backend, memories backend, and new real-messaging tests: **75 passed**, zero failed.
- `pnpm test:voice`: **20 passed**, zero failed.
- `pnpm build`: passed.
- `git diff --check`: passed.
- Dedicated messaging tests cover routing, attribution, membership identifiers, ordering/deduplication, payload validation, acknowledged sending, failed-write draft retention, duplicate suppression, unknown outcomes, late completion isolation, access-error cache suppression, same-Nook artifact labels, and preservation of demo routes. These use controlled mocked responses, not live database writes.
- Browser checks used the normal authenticated development server at `http://localhost:3000`. The real selector loaded existing memberships and a real empty group conversation loaded successfully. Layouts were checked at 320px, 390×844, and desktop 1440px widths without horizontal overflow. Shift+Enter preserved a newline in an unsent draft, which was then cleared. A focused 390×520 viewport simulation confirmed the composer remained visible and bottom navigation hid; this does not constitute a real on-screen keyboard test. The existing demo conversation still rendered its sample story and voice controls.

## Remaining manual checks and limitations

No live messages or other database mutations were made because an approved writable development database was not established. In an approved environment, verify account A sends, B reads/replies, both reload and retain messages, and a nonmember is denied. Also verify membership revocation while a conversation is open, account switching, long populated histories, physical mobile keyboards, and assistive technology.

The backend has no idempotency contract, pagination, real-time transport, persisted voice-message attachment fields, or individual DM threads. An interrupted request can have an unknown outcome, so refresh rather than automatically retrying. Memory attachment composition is deferred to avoid overlapping the teammate's media work. Demo voice/story requests remain frontend-only and separate from real group messages.

The normal development server is left running for review at `http://localhost:3000/messages`. No commits, pushes, merges, deployments, or migrations were performed.
