# Custom domain audit

Primary application origin: `https://www.solibra.club`. The apex `https://solibra.club` redirects there; `https://solibra-two.vercel.app` remains a separate available hostname.

Read-only public HEAD checks returned: apex `/sign-in` HTTP 308 with Location `https://www.solibra.club/sign-in`; www `/sign-in` HTTP 200; previous Vercel homepage HTTP 200. These checks used no session cookies, storage writes, authentication submissions or provider calls; they do not prove authenticated production workflows or live bucket CORS.

## Repository findings

- Authentication server actions redirect to relative `/`, `/profile/setup` and `/sign-in` paths. Middleware redirects derive from the incoming request URL. No login/signup URL is hardcoded to the previous deployment or localhost.
- Session creation and middleware renewal set Secure, HttpOnly, SameSite=Lax cookies without a Domain attribute. Sessions are host-only: logging in on the old Vercel hostname does not log you into www. Sign in again on www. Do not broaden cookie scope or rotate AUTH_SECRET just to change domains. JWT signing/verification does not bind sessions to an application URL. This is credential authentication, not an OAuth callback integration.
- Browser API calls use relative `/api/...` paths with same-origin cookies. Memory photos, original recordings, contribution media and persisted voice processing stay on the currently visited origin. Direct upload sends the file to the short-lived storage URL with credentials omitted, then finalizes through the same-origin application route.
- `lib/nooks/http.ts` compares the incoming Origin to the request URL origin, protecting Nook, media and persisted voice mutations. It has no hardcoded hostname allowlist. The standalone voice guard compares Origin host to request Host and rejects cross-site submissions. Each domain works when used consistently; www, apex and the Vercel hostname are distinct origins. Forwarded headers do not authorize cross-origin API writes. Do not weaken these guards or add wildcard application CORS.
- Next.js Server Actions use their built-in Origin/Host protections. A normal custom domain on the same Vercel deployment does not require adding another cross-origin allowedOrigins entry. If an additional reverse proxy rewrites the host, diagnose its request/forwarding configuration before adding narrowly scoped exceptions.
- `BASE_URL=http://localhost:3000` remains in `.env.example` and the one-time setup script. No running app module consumes BASE_URL. These local setup defaults do not redirect production traffic and were left unchanged. The local 127.0.0.1 warning in `nooks-client.ts` is explicitly limited to local development and builds its address from the current port.
- The only previous-deployment reference in current application configuration is the existing bucket CORS file. Keeping it there supports uploads while that domain remains in use; it does not direct app requests to that hostname.
- The Ohio storage endpoint allowlist, bucket selection and region configuration identify the storage provider, not the application domain. No endpoint, database connection or credential change is needed for the domain move.

No application-code blocker was identified. Only regression tests and this report were added/updated; application code and API contracts were not changed.

## Required manual Neon check

The pre-existing local edit to `cors.json` was preserved. It already contains these exact origins:

```text
http://localhost:3000
https://solibra-two.vercel.app
https://www.solibra.club
https://solibra.club
```

Verify the **live private Ohio `solibra-private` bucket's CORS rules** include `https://www.solibra.club`. A local JSON edit or Vercel redeployment does not apply bucket CORS. If absent, apply the reviewed file yourself using the existing bucket-management workflow. Retain localhost and the old hostname only while they are needed; apex is optional when it always redirects before application usage. Use exact origins without paths/trailing slashes, not `*`.

The existing rule allows POST, AllowedHeaders `*`, and MaxAgeSeconds 300. POST matches the signed form upload flow for photos and recordings. Browser downloads use authenticated app routes; they do not require adding public bucket GET/PUT/DELETE permissions or making objects public. Server-side storage reads are not subject to browser CORS. Keep the bucket private and its endpoint/credentials unchanged.

## Manual Vercel checks

1. Confirm `www.solibra.club` belongs to this project's intended Production deployment with valid TLS, and keep the apex-to-www redirect preserving paths/query strings. No code-level canonical redirect was added, so previews and the previous hostname remain usable.
2. Keep the existing Production database, storage, AUTH_SECRET and AI configuration on the same project. No new environment variable is required for this codebase. If a dashboard-only BASE_URL exists, it may be aligned to www manually for consistency, but no current runtime code depends on it. Do not change connection strings or storage origins to the app domain.
3. Optionally redirect the previous Vercel hostname to www through existing domain controls if you want one canonical user experience. This is not required for functionality. Users must sign in on www; a redirect cannot transfer host-only cookies from vercel.app.
4. Do not add wildcard Server Action origins, proxy app requests through the old hostname, or make frontend API URLs absolute. Forms/API calls should originate and terminate on www.

## Profile-photo / audio-message deployment limitation

At inspection, this checkout was at `48173c5` and did not include the earlier profile-photo API/storage column or the audio-message media APIs. `AccountAvatar` currently renders initials, and message storage in this checkout is the existing text-message model. Their feature-branch implementations cannot be certified or preserved by editing nonexistent files. Confirm Vercel is deploying the branch/commit containing the features you expect. No missing feature was reimplemented as part of this domain-only audit.

The existing memory/contribution photo/audio upload and persisted voice routes were inspected. Their same-origin request behavior and provider-side storage settings are domain-independent. When the profile-photo/audio-message feature branch is deployed, apply the same bucket CORS check and test its authenticated relative avatar/message-media URLs.

## Verification and manual smoke tests

New tests cover same-origin writes on www, apex and the old Vercel hostname; cross-domain/forged-forwarding rejection; authenticated standalone voice authorization on each hostname; and signed-out denial on www. Existing media tests cover credential separation, private retrieval and Range support. No paid provider calls, live mutations, database migrations or cloud changes are part of automated verification.

After deployment/configuration verification:

1. In a fresh browser profile open `https://solibra.club/sign-in`; verify it redirects to `https://www.solibra.club/sign-in`. Sign in on www, reload, navigate to a Nook and sign out. Test signup with a separate account only when you intend to create one.
2. Create/edit a Nook and invitation from www. A 403 origin error requires inspecting the actual request URL/Origin/Host on that deployment; it is not evidence that arbitrary origins should be allowed.
3. Upload a small photo and audio contribution from www. In DevTools verify app initiation/completion use www, the signed POST goes to the Ohio bucket without app cookies, and its response includes the matching CORS origin. A failure only on the storage POST strongly suggests bucket CORS; read back the live rule before changing application code.
4. As a second current member, retrieve the photo/audio through www app URLs and seek in the recording. As a nonmember, access must be denied. Request transcription/translation explicitly only within existing free quotas; server-to-provider calls have no browser CORS/domain callback dependency.
5. Once the correct feature branch is deployed, repeat profile-photo upload/replacement/removal and audio-message playback/translation checks. Confirm no private object acquires a permanent public URL.

Safari/physical-device behavior, live Neon CORS state, Vercel dashboard settings, deployed request forwarding and authenticated production workflows require manual confirmation. No live account or media changes were made during this audit.

Completed checks: all **174 automated tests passed**, standalone TypeScript passed, and the production build passed. Malformed generated `.next/dev/types` initially blocked compilation; only that verified generated directory was cleared, then type generation, TypeScript and build were rerun sequentially successfully. No tsconfig/source workaround was introduced. Existing middleware-deprecation and outdated browser-mapping build warnings remain. No lint script is configured.

Files changed by this audit: `tests/nooks.test.cjs`, `tests/voice.test.cjs`, and this guide. The already-modified `cors.json` was not edited. No runtime files, database/schema/migrations, frontend styling, `.env`, storage configuration, Vercel configuration, or cloud resources were changed.

Official references: [Next.js Server Action origin configuration](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions), [Vercel domain redirects](https://vercel.com/docs/domains/working-with-domains/deploying-and-redirecting), [Neon storage POST and CORS support](https://neon.com/docs/storage/s3-compatibility).
