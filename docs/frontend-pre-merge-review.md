# Frontend pre-merge review

Reviewed on 2026-11-14 on `feat/figma-frontend`. Fetched `origin/main` at `90ae0d81c4df91fa662f80d63825d14335ed31a4`; it is already an ancestor of this branch. No merge, commit, push, deployment, or migration was performed. The untracked `saas-starter/` directory was left untouched.

## Targeted fixes

- Removed twelve unreferenced accidental copies (listed below). Ten were byte-identical. The duplicate voice documentation was older: it described an obsolete 15 MB upload limit and omitted newer language/retry guidance. The duplicate voice tests were an older subset lacking deployment-bypass/forwarded-host coverage. All twelve originals were hash-checked and remain unchanged.
- Temporary messages and voice contributions now explicitly label fixture names as demo personas. The composer always explains that those names do not identify the signed-in author and that nothing is delivered. The recorder distinguishes the demo persona from the signed-in identity before attaching a preview.
- Renamed the recorder target's `authorId` to `previewPersonaId` to make its purpose explicit. Existing contribution/message presentation fields retain their compatible names. Draft protection now includes changes of thread and demo persona, preventing silent reassignment of retained audio to another preview context.

Removed paths:

- `.cursor/settings 2.json`
- `docs/voice-pipeline 2.md`
- `hooks/useAudioRecorder 2.ts`
- `lib/ai/transcribe 2.ts`
- `lib/ai/translate 2.ts`
- `lib/voice/access 2.ts`
- `lib/voice/audio 2.ts`
- `lib/voice/languages 2.ts`
- `lib/voice/request 2.ts`
- `lib/voice/types 2.ts`
- `scripts/dev-voice 2.cjs`
- `tests/voice.test 2.cjs`

## Authorship and backend boundary

`DemoProvider` deliberately plays both sides of a sample conversation: Sofía creates preview text/artifact/request messages; a request response uses the recipient's demo persona. These are fixture `MemberId` values, not authenticated user IDs. They must never be forwarded as trusted authorship. No client-side persona selection grants access or impersonates a real session.

At persistence integration, replace the fixture provider with a presentation adapter. Resolve the actual viewer through the existing session, let the backend derive and validate the contribution/message author, and obtain permitted participants from membership responses. A story request's recipient is the addressee, not proof that the recording came from that person. Preserve `circleId`, `artifactId`, `requestMessageId`, and `contributionId` associations, mapping fixture IDs to real resources through the agreed contract. Remove demo labels only when real authorship and durable-write acknowledgement exist.

The existing Nooks API contract is documented in `docs/nooks-api.md`; this cleanup does not wire fixtures to it or invent messaging/media responses. Messaging, artifact/contribution persistence, delivery, and private-media integration remain separate work. Existing authenticated voice requests still process temporary audio without saving a contribution. Translation-only retries retain the original transcript/audio and use `/api/voice/translate`, not another upload.

The effective diff against fetched main contains no modifications to original API routes, database/schema/migrations, authentication, permission checks, middleware, voice hook/helpers, original voice documentation/tests, or dependency manifests. The frontend `/circles/...` and `/messages/...` pages coexist with `/api/nooks/...` and existing voice endpoints.

## Checks and remaining demo work

See the verification results below. This is a fixture-backed frontend milestone, not a persisted multi-account demo. The cleanup remains uncommitted and must be included before merging.

Next: agree on artifact/contribution/messaging and private-media contracts with the backend owner, then connect real session-derived authorship and persistence through an adapter. Create Memory, persistent messaging, and additional backend features are outside this review.

## Verification results

- `pnpm exec tsc --noEmit`: passed.
- `pnpm test:voice`: 20/20 passed, using the original test file.
- `node --test tests/frontend-phase-two.test.cjs`: 7/7 passed, including request/artifact/contribution integrity, audio retention after processing/authentication failures, and translation-only retry without another upload.
- `node --test tests/nooks.test.cjs`: 14/14 passed, including authenticated access boundaries, membership/ownership rules, invitation handling, and spoofed-actor rejection. These use the existing test harness, not a live database migration.
- `pnpm build`: passed; frontend, dashboard/sign-in, Nooks API, and voice routes compiled together without route conflicts. The first sandboxed attempt was stopped while stalled; the successful run had network permission for existing font downloads. Existing baseline-browser-mapping freshness and middleware-convention warnings remain. Dependency manifests were unchanged.
- `git diff --check`: passed. Final effective comparison against fetched main contains only intended frontend code/assets/tests/documentation, the intentional replacement of the starter homepage, and the existing mobile viewport adjustment. No original backend/authentication/voice implementation changes remain. The twelve accidental additions disappear from the effective comparison after deletion.
- Production browser review at 390×844 and 1440×1000: all three Library doors opened and closed; Messages navigation worked; temporary text was labeled “Sofía (demo persona)” and not delivered; story recording disclosed Elena as a demo persona rather than signed-in authorship. Shared/request cards opened the canonical kitchen artifact; the recipe card opened its own artifact. A new story request retained `sundays-in-her-kitchen` in its DOM artifact reference and its request deep link. Nook recipe filtering and the search empty state worked.
- Mobile composer bottom was 754px, immediately above the 90px navigation; no horizontal overflow. At the end of Memory Details, the voice panel ended at 650px, above the sticky action starting at 682px and navigation at 754px. Desktop Messages and Memory Details had no horizontal overflow. The production preview server started for this review was stopped afterward.

Physical iOS/Android keyboard resize/panning, microphone permissions and capture, actual encoded audio playback across Safari/Chrome, authenticated provider-success processing and live-provider partial failures still need manual testing. The keyboard/viewport implementation was inspected; no physical keyboard test was performed in this review. Draft retarget protection was code-reviewed; its capture-dependent confirmation path needs device testing. The automated recording/error tests exercise controlled recording/API harnesses, not live providers. No permanent storage or cross-account delivery is claimed or implemented.
