# Solibra frontend first pass

Implemented on `feat/figma-frontend`, based on the actual connected Figma file `Um2mpoMAJNKWRuubPDgnc0`.

## Design sources

- Library: M01 `4:8910`, including Main `4:8915`; D01 `4:8909`.
- Nook interior: M02 `4:8918`, including Main `4:8923`; D02 `4:8917`.
- Archive window component set `4:9134`, with Family, Kitchen, and Adventures variants. Miniatures adapt the original Figma geometry; the page layouts use flowing responsive components.
- Actual tokens and fonts: DM Sans for UI; Fredoka for the Library and wordmark; Fraunces for the interior. These differ from the approximate font guidance in the brief and follow the supplied frames.
- Original assets are local in `public/solibra`; `figma-assets.json` records their source nodes. No expiring Figma asset URLs are used at runtime.

## Routes and components

- `/`: complete Library, all three sample Nooks, collection tabs, the mobile “Better with your people” invitation section below the third Nook, and desktop contribution strip/footer.
- `/circles/rivera-family`, `/circles/abuelas-kitchen`, `/circles/little-adventures`: shared Nook interior, responsive bookshelf, two photograph/recipe cards, and audio card.
- `/circles/[circleId]/memories/[memoryId]`: a small, explicitly labeled route handoff so memory links resolve. The memory details design has not been implemented in this pass.
- Shared components and scoped styling are in `components/solibra`. The new `(library)` route group keeps the original dashboard layout and account pages separate. The starter homepage moved out of `(dashboard)`; the URL remains `/`.
- Fixtures live only in `lib/fixtures/library.ts`. Resource IDs and URLs retain `circleId` and `/circles`; the UI uses Nooks. The same three preview memories are reused for each sample Nook and scoped to its ID. Counts on books and Nooks reproduce Figma's illustrative totals, not the number of preview records.

## Working frontend behavior

- One reusable window supports opaque solid doors, pointer/keyboard activation, pressed feedback, a 420ms outward hinge animation, Enter Nook, Close doors, and Escape to close. Reduced-motion styles remove the transition.
- Tabs filter shared Nooks or sort by last visit; selection is reflected in the URL. Arrow, Home, and End keys work in the tab list.
- Search, memory category filters, bookshelf category actions, empty results, and chronological sorting operate on the fixtures. Search never calls a fabricated endpoint.
- Navigation, breadcrumbs, memory links, skip link, account links, dialogs, keyboard focus, and mobile safe-area spacing are implemented.
- Existing account sign-in, dashboard, and sign-out behavior uses the existing routes, user fetch, and action. No authentication or permission logic was changed.

## Explicit placeholders

Create Nook, Add memory, sharing invitations, Messages, and notifications explain that their backend workflows are not connected. No new Nooks or memories are saved. The sample audio card has no recording file; Play explains this instead of simulating playback. `audioSrc` is optional for later real playback integration. The complete memory details screen is still pending.

## Verification

- `pnpm exec tsc --noEmit`: passed.
- `pnpm test:voice`: all 20 tests passed.
- `pnpm build`: passed with required environment already configured and network access for Google Fonts. Existing middleware-deprecation and baseline-browser-mapping warnings remain.
- Browser verification used the built app: Library and interior at 390×844 and desktop at 1440 pixels, with additional overflow checks at 320, 768, and 1024 pixels. No horizontal overflow was observed. All three interior cards and all three Library Nooks remain reachable below the fold.
- Verified opening/closing all three window variants, pointer and keyboard activation, Escape, entry links, adjacent-door/label clearance, collection tabs, recent ordering, memory search and empty results, categories, sorting, notice dialogs, and memory-route handoff. The final mobile navigation measures 90px high at 390×844, matching Figma. The existing `/dashboard` route still redirects an unauthenticated visitor to sign-in, and `/dev/voice` renders its original pipeline screen. No browser console errors were observed in these checks.
- Original images loaded successfully; local files are non-empty and referenced from their corresponding UI slots.
- Protected backend, database, authentication, middleware, and voice files have no diffs. No dependency changes were needed. The untracked `saas-starter/` directory was left untouched with user approval.

Physical iOS/Android touch behavior, device safe-area insets, VoiceOver/TalkBack, OS reduced-motion preference, and authenticated account-menu interactions still need manual testing. Live recording/translation provider calls were not made by this UI work.

Recommended next task: implement the Figma memory details screen and its original-language/translation playback presentation using the existing voice types and pipeline. Do not change the pipeline to accommodate styling.
