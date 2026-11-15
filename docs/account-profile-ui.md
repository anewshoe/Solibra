# Account and profile UI

## Scope and design

Implemented on `feat/nook-profile-ui` from clean `cfbdfe7` (which includes main's merged memory backend). Refreshed main for compatibility; no memory, Create Nook, voice, database, storage, deployment, or dependency changes. No commit, push, merge, migration, or deployment performed.

The sign-in/signup and profile designs extend Solibra's existing visual language; there are no dedicated Figma frames for these screens. Inspected Library M01 (`4:8910`) and Nook D02 (`4:8917`) through Figma MCP using the design-to-code skill. Reused burgundy/rose/cream tokens, DM Sans, Fraunces, Fredoka, local sun mascot, rounded controls and shared button/avatar components. No new assets or packages.

## Screens and behavior

- `/sign-in` and `/sign-up`: responsive Solibra theme, branding, email/password form, pending/error feedback and cross-links. Both retain `inviteId` in navigation and hidden form data. Existing server actions and validation are reused. Failed-sign-in state no longer contains the submitted password; the password input never reads it and is cleared on an action error. Email retention and existing credential messages remain.
- New registrations redirect to `/profile/setup` after the existing transaction and session establishment. Normal registration still creates exactly one initial Nook; invitation signup still follows the existing acceptance transaction instead. Existing-user sign-in still redirects to `/dashboard`.
- `/profile/setup`: initials preview, display name, current authenticated email, Save and Continue, validation/pending/error/success feedback, then a Continue to Library link. It updates the current account, not a second registration.
- `/profile`: actual `/api/user` data, initials, nullable-name fallback/Complete Profile action, Edit Profile, Account Settings, security and sign-out controls. GET `/api/nooks` displays real memberships using each `nook.role`. No invented statistics or fixture account information. Numeric Nooks are not linked to fixture-only interiors.
- `/profile/edit`: uses the same account information form as setup and General Settings. Primary profile editing retains the current account email; email changes stay in General Settings.
- `/dashboard/general`: the account-information section now uses the shared Solibra form/theme. Existing dashboard navigation, routes and password/security controls remain available and unchanged. This does not redesign the rest of the starter dashboard.
- Private member-profile presentation: View members on a real Nook reads GET `/api/nooks/:nookId/members`. Cards show initials/name, specific Nook role, joined date and context; member emails are not displayed. No public user lookup, profile routes by arbitrary user ID, member editing or permission changes. Existing sample avatars inside fixture Nook interiors are unchanged and are not treated as real accounts.

## Authentication, updates and privacy

Profile layout and page entry points call `requireProfileUser`, a small server-only wrapper around existing `getUser`. That function verifies signed session, expiry and active account. Unsigned profile visits redirect server-side to `/sign-in`; client visibility is not the access control. General Settings also verifies the user server-side. Middleware/session/cookie/permission implementation is unchanged.

`AccountInformationForm` is the single update implementation. It trims/validates inputs, calls existing `updateAccount`, retains current email outside Settings, catches failed writes without discarding entries, and refreshes global and viewer-scoped `/api/user` SWR entries plus server-rendered data after success. A cache-refresh failure is distinguished from a failed write. Cancel returns to Profile. The server action still resolves its actor from the authenticated session, never from form user IDs.

New profile/Nook/member cache keys include authenticated viewer ID, avoiding reuse of another account's membership cache. Profile and shared-shell sign-out clear cached account data after the existing sign-out action.

An additional privacy defect was found in the root layout: its SWR fallback used the full `getUser` record, including `passwordHash`, despite the existing API stripping it. The fallback now applies `withoutPasswordHash` before serialization; provider structure and data fetching are preserved. No password/security action other than the requested sign-in reflection cleanup was rewritten.

## Files

Modified:

- `app/(login)/login.tsx`, `sign-in/page.tsx`, `sign-up/page.tsx`
- `app/(login)/actions.ts`: only two password-return removals and the post-signup redirect
- `app/(dashboard)/dashboard/general/page.tsx`
- `app/layout.tsx`: remove password hash from existing user fallback
- `components/solibra/shell.tsx`: profile/account menu, You destination/current state and cache cleanup on sign-out

Added:

- `app/(library)/profile/{layout,page,loading,error}.tsx`
- `app/(library)/profile/setup/page.tsx`, `profile/edit/page.tsx`
- `components/solibra/account-{theme,avatar,form}.tsx`, `account.css`, `profile.tsx`, `member-profile.tsx`
- `lib/auth/require-profile-user.ts`
- `lib/frontend/account.ts`, `account-client.ts`
- `tests/account-profile.test.cjs`
- This document

## Verification

- `pnpm exec tsc --noEmit`: passed after route-type regeneration. Initial standalone check encountered stale production versus development `.next` layout types; build regenerated matching types without changing TypeScript configuration.
- `pnpm test:voice`: 20/20 passed.
- `node --test tests/nooks.test.cjs`: 16/16 passed.
- `node --test tests/frontend-phase-two.test.cjs`: 8/8 passed.
- `node --test tests/create-nook.test.cjs`: 8/8 passed.
- `node --test tests/memories.test.cjs`: 15/15 passed on this branch with the merged backend.
- `node --test tests/account-profile.test.cjs`: 8/8 passed. Real action functions exercised with controlled database/session seams: failed credentials omit passwords; returning sign-in keeps its redirect; signup takes the existing initial-Nook or invitation branch and establishes session before setup; account writes use signed-in user ID; unsigned access fails. Render/logic checks cover invitation propagation and password non-reflection, safe profile fields and null initials, shared form validation/current-email preservation/error recovery/cache refresh, missing-name setup and scoped membership-role display, and member email omission.
- `pnpm build`: passed including protected profile routes, settings, all existing pages and APIs. Existing middleware deprecation and browser-baseline freshness warnings remain.
- Browser: sign-in/signup at mobile and desktop widths (390×844, 320×844, 1440×1000 checks) without horizontal overflow; invitation-linked cross-navigation retained query parameters; mobile You targets `/profile`; direct signed-out visits to `/profile`, `/profile/setup` and `/profile/edit` redirected to `/sign-in`. No real login, registration or account update was submitted.
- Final diff preserves Create Nook, all API routes, schemas/migrations, middleware/session utilities, voice pipeline and password/security settings.

## Remaining integrations and manual checks

Account forms are wired to real existing actions; profile/Nook/member reads use real authenticated contracts. Initials avatars are presentation derived from supported name/email fields, not saved images. No biography, uploaded avatar, relationship, language-preference or fake persistence fields were added.

Real Nook interiors/Library reads remain separate integration work, so Profile exposes memberships and private members without sending numeric IDs into fixture routes. No backend contract blocker was found for this task.

An approved development account/database is still required to verify actual authenticated sign-in, ordinary and invitation-linked signup, name/email writes and uniqueness errors, post-save cache refresh, live sign-out, role/member access with multiple accounts, and signed-in mobile profile/settings appearance. Signed-in screen behavior was covered with controlled fixtures; it was not visually verified with a fabricated session or auth bypass. Real keyboard, screen-reader and physical-device checks remain manual. Existing security pages compiled but password changes/deletion were not performed.

Normal local development remains available at **http://localhost:3000/sign-in** and **http://localhost:3000/profile** (requires sign-in). Use localhost consistently, as described in the Create Nook origin investigation. Existing environment configuration was reused; no Neon/production data was mutated and no voice-auth bypass was enabled.
