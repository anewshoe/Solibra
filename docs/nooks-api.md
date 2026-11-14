# Private Nooks API

Nooks reuse `teams`, `team_members`, `invitations`, and `activity_logs`. Existing IDs, roles, rows, and relationships are retained. A Nook is a private group of any people; no relationship between members is required. No category is required or stored.

Import browser-safe schemas and request/response types from `@/lib/nooks/types`. Use the existing login/session cookie. Never use `users.role` or `/api/user.role` to authorize Nook management: use the membership `role` returned by the Nook API. Every route resolves the actor from the signed session, never from request JSON. Responses use ISO date strings and `Cache-Control: private, no-store`.

## Endpoints

| Method | URL | Access | Request / response |
| --- | --- | --- | --- |
| GET | `/api/nooks` | Signed-in user | `NookListResponse`, only this user's Nooks |
| POST | `/api/nooks` | Signed-in user | `CreateNookRequest` → `NookResponse`, 201 |
| GET | `/api/nooks/:nookId` | Nook member | `NookResponse` |
| PATCH | `/api/nooks/:nookId` | Nook owner | `UpdateNookRequest` → `NookResponse` |
| GET | `/api/nooks/:nookId/members` | Nook member | `NookMembershipListResponse` |
| PATCH | `/api/nooks/:nookId/members/:membershipId` | Nook owner | `UpdateNookMemberRequest` → `NookSuccessResponse` |
| DELETE | `/api/nooks/:nookId/members/:membershipId` | Nook owner | `NookSuccessResponse` |
| GET | `/api/nooks/:nookId/invitations` | Nook owner | `NookInvitationListResponse` |
| POST | `/api/nooks/:nookId/invitations` | Nook owner | `InviteNookMemberRequest` → `NookInvitationResponse`, 201 |
| DELETE | `/api/nooks/:nookId/invitations/:invitationId` | Nook owner | Revoke pending invitation → `NookSuccessResponse` |
| POST | `/api/nooks/:nookId/invitations/:invitationId/accept` | Matching signed-in recipient | `AcceptNookInvitationResponse` |
| GET | `/api/nook-invitations` | Signed-in recipient | Pending invitations for this account → `NookInvitationListResponse` |

Create a Nook with `{ "name": "Weekend stories", "description": "A place for our shared memories" }`. Description is optional and nullable. PATCH accepts name and/or description; use `null` to clear description. Names are trimmed, required, and limited to 100 characters; descriptions to 2,000. Invite with `{ "email": "friend@example.com", "role": "member" }`; role defaults to member. Role updates accept `{ "role": "owner" }` or `{ "role": "member" }`. Unknown properties, including actor IDs, are rejected.

The membership ID in management URLs is `members[].id`, not a user ID. Removing a member revokes all their membership rows for that Nook, including historical duplicates. Role changes likewise apply to all their rows for that Nook. A Nook's last active owner cannot be removed or demoted; transfer ownership first. Account deletion also requires another active owner for each owned Nook, then removes the account's memberships across all Nooks atomically.

Members can read Nook details and active membership profiles (ID, name, email), but cannot manage invitations, roles, or details. Nonmembers get the same 404 as nonexistent Nooks. Invitations are an explicit exception to the membership requirement: only the signed-in account with a matching email may discover or accept its invitation. The inbox exposes invitation metadata, not Nook names, descriptions, or member profiles. Invitations confer no private Nook access until accepted. Email matching is case insensitive; invitation IDs alone grant no access. Acceptance preserves other Nook memberships and does not change an existing member's role.

Invitations remain pending until accepted or revoked; there is no time-based expiration or email-delivery integration. Share an invitation through your own channel or let existing users use their invitation inbox. For new users, the existing `/sign-up?inviteId=ID` path remains supported and creates account/membership/invitation acceptance in one transaction. An invalid invitation rolls back account creation. This reuses the starter's account-email identity model; it does not add email verification.

Writes use transactions and serialize on the existing Nook row, preventing concurrent acceptance from creating duplicate memberships and simultaneous owner changes from removing the last owner. Invite creation rejects existing members and duplicate pending invitations. All membership, invitation, and detail mutations write activity logs in the same transaction. Revoked/accepted invitations cannot be accepted again. An existing member accepting an invitation only consumes it; it never escalates or changes their role.

Errors follow `NookErrorResponse`: `{ "error": { "code": "NOT_FOUND", "message": "Nook not found." } }`. Statuses are 400 for invalid requests, 401 for no valid session, 403 for members lacking owner permission or cross-origin mutations, 404 for unavailable resources, 409 for duplicate/past invitations or last-owner conflicts, and 500 for unexpected failures. JSON writes require `Content-Type: application/json`; browser mutations must be same-origin. Existing starter team UI remains a compatibility view of the earliest membership; use the explicit Nook APIs for multiple Nooks.

## Migration review

`lib/db/migrations/0002_nook_details.sql` contains only:

```sql
ALTER TABLE "teams" ADD COLUMN "description" text;
```

Existing Nooks receive `NULL`; no tables, rows, relationships, or constraints are removed or renamed. Historical migrations are unchanged. Review this SQL before authorizing execution. After approval, run `pnpm.cmd db:migrate` on Windows (or `pnpm db:migrate` elsewhere). It applies all pending migrations in order, including `0001_remove_payments` if that remains pending; review those too. Apply the approved migration before running this backend because Drizzle now selects the description column. Do not reset or seed the existing Neon database. No migration was applied during implementation and `.env` was not edited.

## Manual test with three users

Use a development database and three separate browser profiles so sessions do not overwrite each other. After migration approval/application, run `pnpm.cmd dev`. Register/sign in as A, B, and C with different email addresses. Registration creates each user's initial Nook; users may create more through the API.

In each profile's browser console, define:

```js
async function api(url, method = 'GET', body) {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    ...(body === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
  });
  const result = await response.json();
  console.log(response.status, result);
  return result;
}
```

1. As A, create a shared Nook with `await api('/api/nooks', 'POST', { name: 'Weekend stories' })`. Record `nook.id` as N. GET `/api/nooks` should include N with role `owner`.
2. As A, invite B using `await api('/api/nooks/N/invitations', 'POST', { email: 'B_EMAIL', role: 'member' })` (replace N and B_EMAIL). Record `invitation.id` as I. A can list N's invitations; a duplicate pending invite should return 409.
3. As B, GET `/api/nook-invitations` should contain I. Before accepting, GET `/api/nooks/N` and `/api/nooks/N/members` should return 404. POST `/api/nooks/N/invitations/I/accept` should return 200. Repeating it should return 409. GET `/api/nooks` should now include both B's original Nook and N; GET `/api/nooks/N` and its `/members` should return 200 and show A and B.
4. As B, PATCH `/api/nooks/N` with `{ name: 'Unauthorized edit' }`, POST its `/invitations`, GET its `/invitations`, and PATCH/DELETE its member URLs: all should return 403. Being an owner of B's original Nook must not grant ownership of N.
5. As C, GET `/api/nooks` must exclude N and GET `/api/nook-invitations` must exclude I. GET N and its `/members`, PATCH N, POST/list/revoke N's invitations, and PATCH/DELETE its members should return 404. Attempting to accept B's invitation should return 404, including while it is still pending. Knowing N, I, and membership IDs must not grant access.
6. As A, update N's description (200). Try to remove/demote A while A is the only owner (409). Promote B using B's membership ID (200), then demote A (200). A now receives 403 on management requests; B can manage N. Confirm another Nook's membership/invitation IDs cannot be used through N's URLs (404).
7. As B, remove A, then retry N's details/member reads as A: both should return 404 and N should disappear from A's Nook list. B remains owner, C remains denied, and A still has access to any other memberships.
8. Repeat with a new pending invitation: revocation prevents acceptance (409). Concurrent duplicate acceptance attempts should yield one 200 and one 409, with one resulting membership. Signed-out or invalid-session requests to every endpoint should return 401.

## Automated checks

Run `node --test tests/nooks.test.cjs`, `pnpm.cmd exec tsc --noEmit`, and `pnpm.cmd build`. The tests exercise actual service functions, route handlers, validation, and scoped SQL expressions using scripted database results. They never read `.env` or connect to Neon. Real PostgreSQL transaction/concurrency and live browser-session behavior require the manual checks above; unit tests do not replace them.
