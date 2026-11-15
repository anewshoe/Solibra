# Real voice frontend integration

## Voice UX repairs after `ee3ed13`

- Perspective selection now opens only Write or Record. Text and hidden recording drafts are kept; hiding/closing the recorder stops the microphone. Switching a resumed draft to a new voice clears its ID and warns before discarding local audio.
- Confirmed audio perspectives collapse the editor and render once. An audio memory's original recording is prominent near its title, not duplicated in the voices sidebar.
- Create Voice Memory uses Record → Save → Transcribe & Translate → Done, inline title validation, and contextual recovery. Save-state snapshots update after every confirmed stage and failure. Upload acknowledgment enables playback/processing even when the follow-up metadata read fails. Recovery explicitly verifies real account/Nook/resource IDs.
- Collapsed voice cards hide transcripts. Saved-language selection and new-language requests are separate. Translation-fetch/provider errors preserve authorized audio; generation 403 is distinct from read revocation. A 409/unknown outcome requires refresh before retry, and fresh processing leases block repeat requests.
- Fixed a development playback bug: effect cleanup unloaded the audio URL during React effect replay without restoring it. Setup now restores the authorized source; real unmounts still pause/unload it.
- Focused mocks cover these repairs. Browser review verified existing stored audio playback after reload, persisted transcript/translation reads, editor switching/closing with preserved text, and mobile layout. No new recordings, provider requests, or database mutations were made; fresh save/processing and microphone close behavior still need an approved development smoke test.

On `feat/mvp-integration`, fast-forwarded the clean working tree from `b31004c` to main `712553d`. No backend, provider, recorder-hook, schema, environment, storage, or deployment implementation was changed.

## Connected behavior

- Create Memory offers Voice Recording (`audio`) with an optional description. It reuses `useAudioRecorder` (three minutes, 4 MiB), validates the actual Blob MIME/size/container with existing media validation, and never relabels/transcodes recordings.
- New voice memories create an artifact, then an audio contribution, then upload only to that contribution through `uploadPrivateMedia`. Confirmed IDs survive stage failures. Upload retry first reads the contribution, so a lost completion acknowledgment does not cause another upload. `cleanupPending` is successful attachment.
- Unknown artifact/contribution creation outcomes block automatic repeat creation. Users can inspect their saved memory in a new tab without losing the local recording. After a contribution timeout, a refresh offers explicitly selected, confirmed empty drafts authored by the current user. Partial artifacts remain accessible from the real Nook.
- Saving and provider processing are separate explicit actions. A successful upload says **Recording saved**, not that transcription/translation is complete. Local preview remains available until page navigation; type switching and re-recording are blocked when they would discard an in-flight or identified recording.
- All real memory types accept audio perspectives. Saved empty drafts can be resumed by their author. Existing text perspectives remain unchanged. No temporary demo personas or preview transcripts are persisted.
- Saved voices use authenticated contribution media routes and native seeking. Legacy artifact-level audio remains supported; new audio artifacts with contribution recordings link to the original voices area rather than incorrectly saying there is no recording.
- Expanding a voice lazily reads its current contribution and saved translations through account/resource-scoped SWR keys. All members can read saved results. Only the author or Nook owner receives process/new-language controls; the server remains authoritative.
- The existing process/translation schemas and `PersistedVoiceResponse` are reused. Processing sends the selected target language and `reprocess:false`; additional-language requests and translation-only retries use the saved-transcript translations endpoint. No audio/transcript/provider results are posted as persistence fields. The request timeout is 185 seconds, exceeding the backend's 140-second provider deadline and 180-second route duration.
- Translation-stage failures preserve the returned saved contribution and source transcript. The next action retries translation only. Other processing failures refresh saved status; 409 explains the three-minute lease and offers refresh. Provider/network failures never automatically retry provider work, reupload audio, or create records.
- PrivateRecording resets failed-load state on URL changes, pauses/clears the old media on unmount or URL replacement, and offers an explicit authorized-load retry. Late processing results after unmount cannot repopulate private voice caches. Parent membership error handling and existing sign-out cache clearing remain in place.

## Files

Added `lib/frontend/persisted-voice-client.ts`, `components/solibra/voice/real-recorder.tsx`, `components/solibra/voice/saved-voice.tsx`, `tests/real-voice.test.cjs`, and this note. Updated `create-memory.tsx`, `real-memory-details.tsx`, `private-recording.tsx`, `memory-book.tsx`, `real-memories.css`, `lib/frontend/real-memories.ts` (audio contribution adapter), and the existing memory-test hook mock.

## Verification and remaining live checks

- TypeScript and production build passed. Existing middleware/browser-mapping warnings remain.
- Ran the persistence, media, memories, recorder/voice, real-memory, phase-two, UI-polish, and new real-voice suites. Initial result: 103/106 passed; three frontend mock assumptions needed updates. Rechecked only the two affected frontend files: 19/19 passed, including one additional partial-response rendering test. Across those runs, 107 unique focused tests passed; unrelated account/Nooks/messaging suites were not repeated.
- Browser verified the real Create Memory Voice Recording option, optional story field, disabled pre-record Save action, recording limits, and French target selection at 390px without horizontal overflow. No microphone, storage, database, or provider mutation was performed.
- Still requires an approved development Nook/storage/provider smoke test: one short recording, upload, processing, reload playback/source/translation, second-member reading and recording, member-vs-owner controls, seeking, and physical-device MIME/microphone behavior. Mocked tests do not verify Neon/CORS, deployed runtime duration, provider quotas, or live cross-account persistence.

Preview remains the normal server at `http://localhost:3000`; enter a real Nook → Add Memory → Voice Recording, or open a memory → Add your perspective → Record a voice perspective. No commits, pushes, deployments, or migrations were performed.
