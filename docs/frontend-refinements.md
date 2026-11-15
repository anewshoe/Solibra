# Frontend UI refinements

Implemented on `feat/figma-frontend`, preserving the prior uncommitted pre-merge cleanup and leaving `saas-starter/` untouched.

## Changes and files

- `components/solibra/shell.tsx`: top-level navigation is Library and Messages on desktop, and Library / Messages / You on mobile. Existing account menu remains. Library is current on `/` and `/circles/...`; Messages is current only on conversations. Library collection tabs and routes remain unchanged.
- `components/solibra/solibra.css`: normal desktop header uses the same `--sol-raised` surface as mobile, shared desktop active underline, arched recessed bookshelf with warm interior and cream shelf, responsive display of all six shelf artifacts, activity and description editor styling. Original bookshelf JSX, book actions, memory URLs, door animation, and conversation header rules are unchanged.
- `lib/fixtures/library.ts`: distinct descriptions for all three sample Nooks.
- `components/solibra/nook-interior.tsx` and new `nook-description.tsx`: shared description display with whitespace/null fallback. Optional editor supports cancel, pending save, 2,000-character validation using the existing browser-safe Nooks schema, clearing via null, response-driven display, and retained drafts/error feedback on failure.
- `components/solibra/library.tsx`, new `recent-additions.tsx`, and `lib/fixtures/recent-additions.ts`: compact reusable Recent Additions with sample activity disclosure, Nook eyebrow, activity text, listening mascot, and canonical memory link on mobile and desktop. Independent of the Recent collection tab.
- `tests/frontend-phase-two.test.cjs`: added rendered description fallback/permission checks; eight frontend tests total.

## Description integration boundary

Current pages still have fixture string IDs; they remain read-only and issue no description requests or fake saves. The reusable editor is intentionally not enabled on those fixtures, even for a signed-in account. It requires a positive numeric resource ID and the per-Nook membership role `owner`; `member`, missing editor data, and fixture IDs expose no Edit action. This presentation gate does not authorize a write.

When wiring real Nooks, read the resource with the existing authenticated session and provide `editor.nook` from its Nook API response, not `/api/user.role` or a fixture persona. Provide `editor.save(id, description)` as an adapter to same-origin authenticated `PATCH /api/nooks/:nookId`, JSON `{ description }`, returning the actual `NookResponse` only for successful responses and rejecting on HTTP failures (including 401/403). Refresh the Nook cache after success and permission changes; key the component by the numeric Nook ID when changing resources. The server remains authoritative for membership and permissions. No backend code, schema, authentication, API contract, dependencies, or persistence was changed. No migration was run.

## Verification

- `pnpm exec tsc --noEmit`: passed.
- `pnpm test:voice`: 20/20 passed.
- `node --test tests/frontend-phase-two.test.cjs`: 8/8 passed, including rendered owner/member/fixture-ID gating and empty-description fallback.
- `node --test tests/nooks.test.cjs`: 14/14 passed.
- Production build passed with existing middleware deprecation and browser-baseline freshness warnings.
- Production browser checks at 390×844, 320×844, and 1440×1000: no horizontal overflow or item text overflow in the bookshelf; all six books/photos render; recipe book filters the memory list. Mobile navigation destinations are evenly sized. Recent Additions links to the canonical kitchen artifact. Library is current on Memory Details and Nook interior. Header surface resolves to the existing rose token (`rgb(135, 48, 66)`).

The editor's authenticated save/error flow awaits the real-resource adapter and live owner/member testing. Its sample-page read-only state and rendered permission/fallback states were checked; no real description was written. Physical keyboard/microphone/live voice provider behavior was not retested in this styling pass; existing failure-recovery suites passed. No commit, push, merge, deployment, or database migration performed.
