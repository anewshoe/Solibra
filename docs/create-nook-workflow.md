# Create Nook workflow

## Branch and compatibility

Work remains on `feat/nook-profile-ui`; the refinement started from clean commit `d6828d9`. Refreshed main now includes the memory backend at `305ec4f` (PR #4). Reviewed its contracts, routes and shared `nookResponse` usage; the Nook create/invitation contracts are unchanged. Main has not been merged into this branch. Its memory files were inspected and its tests executed in a temporary read-only-source snapshot, without modifying the teammate's implementation or database. No profile work, dependency changes, environment changes, migrations, commits, pushes, merges or deployments were performed.

## Final flow

1. **Customize your Nook**: required name, optional description, counts and existing schema validation. Placeholders are “The Goyettes” and “What kind of memories do you want to collect?”; fields start empty. Native radios select Pink (default), Lilac, Blue, Green or Yellow, with labels, visible selection and keyboard navigation. Selected panel/trim colors update the existing arched-door structure immediately. The previous illustration slogan is removed.
2. **Review and create**: description/name/privacy and the chosen color preview. Back preserves input and color. Create posts only validated `name` and `description` to the existing authenticated, same-origin `POST /api/nooks`; blank descriptions become null. A valid HTTP 201 response and positive numeric ID are required. Failures stay on Review with the draft and error visible. A successful response stores the real Nook and then opens the preview doors for 500ms before advancing. Reduced-motion preference skips the delay. Controls remain locked through the transition, timers are cleared on unmount, heading focus moves on advancement, and creation is announced with a status message.
3. **Invite your people (optional)**: operates only on the confirmed numeric ID. Emails are normalized/deduplicated; queued entries can be removed. Creation/retry uses existing invitation APIs, default `member` role and validated response associations. Confirmed invitations are not resubmitted. Failed invitations do not undo the Nook. Both Skip invitations and Continue to Ready advance to the final screen, even after failures. Unsubmitted/failed invitations are disclosed in the final summary.
4. **Your Nook is ready**: created name, description, numeric reference, selected preview color, friendly success message, confirmed pending-invitation summary, and Return to Library. Back to invitations allows retries without recreating the Nook. The final panel reveals with a short CSS animation (disabled for reduced motion).

The door color is **frontend-only**. `lib/frontend/nook-colors.ts` defines its reusable type/options; scoped custom properties affect only this workflow's preview. Color never enters `CreateNookRequest`, the database, existing sample Nooks or global theme. It is not saved or synchronized and clears on route exit/refresh. Persisting it requires a future agreed backend field and read/write contract.

## Origin failure: diagnosis and correction

Reproduced with the normal local Next.js development server using unauthenticated, invalid-body POSTs that could not write database rows. A temporary diagnostic recorded only Origin, request URL origin, Host and forwarded host/protocol; it was removed completely after diagnosis. No cookies, session values or tokens were logged.

| Address used | Browser/request Origin | Route URL origin | Host / X-Forwarded-Host | X-Forwarded-Proto | Result |
| --- | --- | --- | --- | --- | --- |
| `http://127.0.0.1:3000` | `http://127.0.0.1:3000` | `http://localhost:3000` | `127.0.0.1:3000` | `http` | 403 before authentication |
| `http://localhost:3000` | `http://localhost:3000` | `http://localhost:3000` | `localhost:3000` | `http` | 401, correctly reaching authentication unsigned |

Next dev normalizes the route URL to localhost in this setup. The correction is to use **http://localhost:3000/nooks/new consistently**, including sign-in. Cookies for 127.0.0.1 and localhost are separate; sign in on localhost if needed. The client now offers this corrective address when the exact origin rejection occurs on 127.0.0.1. It does not redirect/resubmit automatically or override Origin headers.

`lib/nooks/http.ts` and API routes remain unchanged: no CSRF exception, hostname alias allowlist, wildcard CORS, proxy trust change or authentication bypass was introduced. Forged forwarded headers remain unable to override the expected origin. Arbitrary hosts, scheme/port mismatches and unrelated origins are still rejected. Direct matching 127.0.0.1 URL/origin requests pass in controlled tests, but the normalized localhost route requires localhost in this actual dev setup. Do not use the old 127.0.0.1 preview address for this workflow.

Production same-origin URL pairs are covered by controlled helper tests, including an HTTPS deployment-style hostname; no live Vercel/proxy test was performed. If a deployment normalizes the route origin differently, verify its trusted origin configuration separately rather than trusting arbitrary forwarded headers.

## Real resources and remaining integration

The numeric Nook returned by HTTP 201 is authoritative for invitations. It is never routed into a fixture-only `/circles/[id]` interior. Returning to the sample Library does not insert a pretend fixture or claim the real resource appears there. Signup's initial Nook behavior is unchanged. Only confirmed API writes are described as created; invitation emails are never described as sent.

Workflow display/queue clears on refresh or route exit; confirmed Nooks and invitations remain backend records. Client refs prevent rapid repeat submissions but cannot guarantee exactly-once writes after a transport failure/reload: the API has no idempotency-key contract. Unknown outcomes are disclosed, original drafts remain, and there is no automatic retry. Check existing records before explicitly retrying an ambiguous result.

Remaining work: connect Library to authenticated real-Nook reads and numeric-resource interiors; add invitation inbox/acceptance UI separately; agree on color persistence if desired. The new memory backend exists on main, but this task neither incorporates it nor connects fixture memories to it. Backend membership/session checks remain authoritative, and global `/api/user.role` is not used for Nook ownership.

## Changed files

- `components/solibra/create-nook.tsx`: reordered flow, color controls, success transition, final summary.
- `components/solibra/create-nook.css`: local pastel tokens, swatches, active-step emphasis and reduced-motion-aware reveal.
- `lib/frontend/nook-colors.ts`: new reusable color type/options and transition duration.
- `lib/frontend/nooks-client.ts`: actionable local-hostname error recovery, same authenticated contracts.
- `tests/create-nook.test.cjs`: updated flow plus retained colors, placeholders, failure/finish/retry behavior, transition/reduced motion, timer cleanup and hostname recovery.
- `tests/nooks.test.cjs`: same-origin, forged forwarding, normalized-host rejection, unauthenticated and malformed creation/invitation regression cases.
- This document.

## Verification

- `pnpm exec tsc --noEmit`: passed.
- `node --test tests/create-nook.test.cjs`: 8/8 passed.
- `node --test tests/nooks.test.cjs`: 16/16 passed.
- `node --test tests/frontend-phase-two.test.cjs`: 8/8 passed.
- `pnpm test:voice`: 20/20 passed.
- `pnpm build`: passed. Existing middleware-deprecation and stale browser-baseline warnings remain.
- Main's `tests/memories.test.cjs`: 15/15 passed from an isolated snapshot of fetched main, not as an integrated feature-branch run.
- Actual browser: Customize/Review checked at 320×844, 390×844 and 1440×1000 without horizontal overflow; all five swatches changed panel/trim colors, arrow keys selected radios, color survived Review/Back, placeholders/title were correct, and active label/circle measured 14px/30px. No successful mutation was submitted from the browser.
- Creation acknowledgment/animation timing, reduced-motion skip, final Ready, failed invitations with finish/retry, and timer cancellation were verified using controlled component/API test harnesses, not live provider/database responses. Authenticated persistence, real mobile keyboard/screen-reader behavior and final success/invitation visual layouts remain manual checks in an approved development environment.

Normal local server remains running on port 3000. Use **http://localhost:3000/nooks/new**. Live creation/invitation tests still require an approved development database; no Nooks were created in Neon during this task.
