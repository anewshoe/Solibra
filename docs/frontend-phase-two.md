# Solibra frontend Phase 2

Implemented on `feat/figma-frontend`, continuing commit `9e2b2ec`. No commits, pushes, merges, or deployments were performed.

## Screens and design sources

- Family Messages: M04 `4:8934`, full scrollable Main `4:8939`, D04 `4:8933`.
- Keyboard-open reference `21:4187`: implemented a real textarea and visual-viewport sizing, without drawing the prototype keyboard.
- Recording overlay `21:4363` and Story Recorder `4:10879`.
- Memory Details: M03 `4:8926`, full Main `4:8931`, D03 `4:8925`.
- Existing DM Sans, Fredoka, Fraunces, colors, avatars, photographs, mascot, and Nook window are reused. Four original Figma control SVGs were downloaded. Both newly referenced photographs were verified identical to the existing local kitchen photograph and reuse that file. Provenance is in `public/solibra/figma-phase2-assets.json`.

## Changed files

Routes and layout:

- `app/(library)/layout.tsx`: shared preview provider and scoped Phase 2 styles; existing root authentication and SWR providers remain unchanged.
- `app/(library)/messages/[circleId]/page.tsx`, `loading.tsx`, `error.tsx`: conversation route and route-level loading/error presentation.
- `app/(library)/circles/[circleId]/memories/[memoryId]/page.tsx`: replaces the placeholder with the full memory screen. The old `elenas-original-story` URL redirects to its actual photograph artifact.

Presentation and state:

- `components/solibra/messages.tsx`: conversation sidebar/header, scrollable thread, text/artifact/request/voice messages, attachment picker, composer, contact selection, empty state, and temporary-content disclosures.
- `components/solibra/memory-details.tsx`: photograph, metadata, story, perspectives, voice contribution selection, transcripts, translations, sharing/request actions, and mobile sticky voice action. Missing temporary contribution links are explained explicitly.
- `components/solibra/demo-provider.tsx`: shared in-memory messages, contributions, recording target, draft, and owned preview audio URLs.
- `components/solibra/voice/use-voice-preview.ts`: recording presentation and request lifecycle, reusing the original recorder and API contracts.
- `components/solibra/voice/recorder-dialog.tsx`: reusable recording overlay, processing/recovery controls, and temporary preview attachment.
- `components/solibra/voice/contribution-transcript.tsx`: original transcript, target-language selector, cached translations, authenticated translation requests, and retry/error states.
- `components/solibra/audio-player.tsx`: real audio playback, seek controls, errors, and explicit unavailable-fixture audio behavior.
- `components/solibra/member-avatar.tsx`: shared existing shadcn avatar composition.
- `components/solibra/use-conversation-viewport.ts`: real visual-viewport resize/pan handling and keyboard-related navigation visibility.
- `components/solibra/phase-two.css`: responsive styling scoped to the new screens and their shared controls.
- `components/solibra/shell.tsx`: Messages links and active state; replaces the normal mobile header on conversation routes.
- `components/solibra/memory-card.tsx`: shared player and canonical artifact links.
- `components/solibra/library.tsx`: Listen to her story now opens Memory Details.
- `components/solibra/nook-window.tsx`: optional initial-open prop for the conversation context; existing Library defaults and animation remain unchanged.
- `lib/fixtures/conversations.ts`: typed presentation fixtures and stable Circle, Artifact, Contribution, Message, and thread references.
- `lib/frontend/demo-state.ts`: relationship validation and atomic contribution/message insertion.
- `lib/frontend/voice-client.ts`: client transport for the two existing voice endpoints, without persistence or bypass headers.
- `tests/frontend-phase-two.test.cjs`: seven focused frontend tests.
- `public/solibra/{back,more,attach,microphone}.svg` and `figma-phase2-assets.json`.
- This document and the first-pass document's status link.

## Working frontend behavior

Messages use `/messages/[circleId]`. Desktop has a sidebar, conversation thread, and existing interactive Nook window. Mobile has one conversation-specific header, a separately scrolling log, a composer, and the correct active bottom navigation. Text sends, attached memories, story requests, contact selection, and sharing operate in temporary client state.

Requests always reference an existing artifact. Contributions retain `circleId`, `artifactId`, `contributionId`, and optional `requestMessageId`; voice messages reference the same contribution. The reducer rejects cross-artifact, cross-Nook, incorrect-recipient, and duplicate contribution relationships. Conversation voice links select that exact contribution in Memory Details. The original memory story and the conversation reply are separate fixture contributions to the same photograph.

The shared recorder remains mounted in the library layout when its overlay closes or related routes change. Closing during capture stops and keeps the recording; cancelling a pending permission request cancels that draft request. Switching to a different artifact/request requires explicitly keeping or discarding the current draft. Attached previews own separate audio URLs, so re-recording or discarding the recorder draft does not revoke an already attached preview. Leaving the library layout or refreshing clears temporary state and releases owned URLs.

The recorder reuses `useAudioRecorder`, its three-minute/4 MiB limits, `filenameForAudio`, `TARGET_LANGUAGES`, and the existing result types. Spoken language is detected automatically. Processing posts multipart audio and a target language to `/api/voice/process`. A translation failure retains the original transcript, detected language, and original audio. Retries and target changes post only JSON transcript/language fields to `/api/voice/translate`; they do not upload or transcribe audio again. Requests use normal same-origin authentication. Sign-in recovery opens a new tab to preserve the draft in the preview tab.

## Temporary content and integration points

All conversations are fixtures or in-memory previews. Nothing is persisted, delivered to another account, or uploaded to private media storage. Fixture audio has no recording file; Play explains this and the player labels audio as unavailable. Real captured audio has playback controls. Processing results can be attached as explicitly temporary previews, including a completed original transcript whose translation still needs retrying.

These are frontend presentation interfaces, not an agreed backend API contract. Before connecting persistence, confirm with the backend owner:

- Conversation/thread identifiers, membership, current-user attribution, pagination, delivery, and error contracts.
- Commands and responses for text messages, artifact sharing, story requests, and contribution attachment, preserving the reference relationships above.
- The private-media upload/read flow, media lifetime and expiry handling, and when durable contribution creation is acknowledged.
- Artifact/contribution reads, translation storage, and the mapping from real IDs and authorization responses to these presentation components.

Replace the fixture provider with an adapter after those contracts exist. Remove temporary labels only after durable persistence is acknowledged. The recording/transcription/translation endpoints themselves do not save contributions. Create Memory (M05/D05), Create Nook, invitations, and profile redesigns were not implemented.

## Verification

- `pnpm exec tsc --noEmit`: passed. Old duplicate generated `routes.d 2.ts`, `routes.d 3.ts`, `validator 2.ts`, and `validator 3.ts` in ignored `.next/types` were confirmed generated and removed; Next route types were regenerated.
- `pnpm test:voice`: all 20 existing tests passed.
- `node --test tests/frontend-phase-two.test.cjs`: all 7 tests passed. Coverage includes reference integrity, duplicate prevention, original-audio preservation, partial translation failure, translation-only retry, cancelled/stale requests, and authentication recovery. Provider successes are not mocked.
- `pnpm build`: passed with the existing environment and Google Fonts network access. Existing middleware-deprecation and baseline-browser-mapping warnings remain.
- Browser compared Messages and Memory Details with Figma at 390×844 and desktop widths. Additional 320, 768, and 1024 pixel checks showed no horizontal overflow. Original images and new control assets loaded in the expected slots.
- Mobile Messages measured one 80px visible conversation header, a 614px scrolling thread, a 60px composer, and a 90px bottom navigation at 390×844.
- A simulated visual-viewport reduction to 520px kept the composer bottom at 520px and hid bottom navigation; restoration put the composer bottom at 754px above the navigation. This is a viewport simulation, not a physical keyboard test.
- At the bottom of mobile Memory Details, the last content ended at 650px, above the sticky action at 682px and navigation at 754px. There is one visible Add Your Voice action per breakpoint.
- Verified artifact selection/request creation, recorder overlay opening/cancelling, temporary text messages, contact switching, matching contribution deep links, transcript/fixture translation switching, empty conversations, and unavailable preview notices.
- An actual unsigned translation request returned the expected authentication error; the original transcript remained available. No live provider-success or microphone capture claim is made.
- Verified Nook → Memory Details → Messages navigation, homepage Listen action, Library door open/close and collection tabs, and Nook search/category filters.
- Tracked API, authentication, database, middleware, existing voice code, root layout, dependency files, and voice-pipeline documentation have no changes.

Physical microphone capture, decoding/playback on real Chrome/Safari/mobile devices, authenticated provider-success processing, live-provider partial failure, OS keyboard behavior, OS reduced-motion preferences, and screen-reader checks still require manual verification. Loading/error route boundaries are implemented and type-checked; a route-render failure was not deliberately induced in the browser.

## Workspace notes and next step

The untracked `saas-starter/` checkout remains untouched. Unrelated untracked files with `2` suffixes appeared during this work (including voice hooks/libraries/documentation, scripts, tests, and editor settings); they were not created or edited by this phase and are not part of its change set.

Next: agree on the messaging, contribution, and private-media persistence contracts with the backend owner, then connect these presentation components through an adapter and run the authenticated physical-device demo flow. Do not change the existing voice pipeline to accommodate the UI.

## Pre-merge cleanup

See [the final frontend review](frontend-pre-merge-review.md) for removal of the subsequently tracked duplicate files, explicit demo-persona attribution, draft-target protection, current-main compatibility, and final checks. The earlier workspace notes describe the state during phase two.
