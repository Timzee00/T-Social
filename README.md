# Timzee Social Platform

A production-oriented social platform inspired by modern Instagram-class systems. The product surface is implemented as a real React + tRPC + Hono + Drizzle application, not a static mock-up.

## Architecture

- **Web:** React 19, Vite, TypeScript, React Router, TanStack Query.
- **API:** Hono + tRPC with authenticated procedures, request IDs, structured request logs, security headers, origin checks, body limits and rate limiting.
- **Auth:** Kimi OAuth, Google Identity Services, Facebook Authorization Code, phone OTP/verification and Sign in with ChatGPT/OIDC hooks. All providers terminate in first-party, opaque, hashed sessions stored in MySQL.
- **Database:** MySQL via Drizzle ORM. Hot-path indexes and denormalized engagement counters are included for feed, messaging, notifications and search-adjacent access patterns.
- **Media:** object storage. The browser uploads directly to `/api/media/upload`; the database stores keys rather than expiring signed URLs.
- **Distributed controls:** optional Upstash Redis REST for coordinated rate limiting. An in-process fallback remains available for local/single-instance development.
- **Background work:** scheduled-message worker with atomic claim, stale-lock recovery, retry limits and cleanup.
- **Recommendation boundary:** bounded candidate retrieval followed by a replaceable ranking service. The current fallback is deterministic; a learned ranker can replace it without changing the client API.

## Product surface

Posts, carousels, Reels, Trial Reels, Friends-style Reels, Stories, close friends, archive, highlights, Notes, Instants, profile pins, private accounts, follow requests, favorites, block/restrict, search, DMs/groups, message scheduling, reactions, attachments, broadcast channels, tagged-media Map, creator insights, drafts, trust & safety, sessions and a Live signaling foundation are implemented.

See `docs/FEATURE-MATRIX.md` and `docs/INSTAGRAM-PARITY.md` for the precise release boundary.

## Production principles

The system follows broad scaling principles used by large social systems: separate candidate retrieval from ranking, keep hot reads index-friendly, avoid expensive per-request scans, cache short-lived media URLs, denormalize high-frequency counters, make background work idempotent, and treat object storage as a separate media plane.

It does **not** claim to reproduce Meta's proprietary internal systems, ranking models, TAO/Memcache stack, global live-video fabric, or multi-region control plane.

## Local setup

1. Copy `.env.example` to `.env`.
2. Configure database, object storage and the providers you intend to enable.
3. Install with `npm ci`.
4. Apply the Drizzle schema/migrations to the target MySQL database.
5. Start development with `npm run dev`.

Before production promotion, use `npm run check`, `npm run lint`, `npm run test`, `npm run build`, and the Playwright smoke suite.

## Identity providers

The application exposes one local account/session model behind the provider layer.

- **Google:** Google Identity Services client ID + server-side ID-token verification.
- **Facebook:** server-side authorization-code exchange using a Meta app.
- **Phone:** Twilio Verify-style SMS verification with server-side challenge/attempt controls.
- **ChatGPT:** OpenID Connect + Authorization Code + PKCE; provider approval/client credentials are required.
- **Kimi:** authorization-code flow with signed short-lived state and browser binding.

Actual provider availability depends on the provider credentials, callback/origin configuration and any approval requirements.

## Required production environment

`APP_ID`, `APP_SECRET`, `SESSION_SECRET`, `PUBLIC_APP_URL`, `DATABASE_URL`, `KIMI_AUTH_URL`, `KIMI_OPEN_URL`, and `CRON_SECRET` are required in production.

Set the provider variables in `.env.example` for Google, Facebook, OpenAI/ChatGPT and Twilio phone sign-in. Set Upstash Redis variables for multiple application instances. Set `RELEASE_VERSION` and `COMMIT_SHA` in deployments.

## Operational endpoints

- `GET /api/healthz` — process liveness.
- `GET /api/readyz` — process + database readiness.
- `GET /api/version` — release metadata.
- `POST /api/cron/scheduled-messages` — protected background worker.

## Media flow

The browser uploads media as multipart form data. The server authenticates the session, applies purpose-specific limits, validates the media signature, stores the object, records a short-lived upload claim and returns a storage key. Product mutations reference the key rather than embedding base64 payloads in tRPC requests.

## Verification

The repository contains feed-ranking, media-validation and authentication-input tests, Playwright UI smoke tests, security/release documentation and a CI workflow covering install, typecheck, lint, unit tests, production build and browser smoke tests.

## Known infrastructure boundaries

Licensed music catalogues/rights enforcement, global Live SFU/CDN infrastructure, automated moderation, payments/payouts, dedicated search/recommendation infrastructure, full MFA/passkeys/account recovery and certain newer Instagram interaction layers remain explicit follow-up infrastructure rather than simulated UI.

See:
- `docs/PRODUCTION-READINESS.md`
- `docs/SECURITY-RELEASE-CHECKLIST.md`
- `docs/INSTAGRAM-PARITY.md`
- `SECURITY.md`
