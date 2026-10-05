# T Social — Powered by Timzee Corp

A React/TypeScript social application with a Hono/tRPC API, MySQL/Drizzle persistence and private S3-compatible media. This release rebuilds the **original supplied Kimi ZIP**; the earlier expanded release archives were unavailable. Earlier feature claims are not treated as implemented code.

## Implemented

Photo/video posts and carousels (up to 10 items), a Reels filter, For You/Following feeds, likes, comments, saves, real post links, profiles and search. Private accounts, approved follow requests and bilateral blocking are enforced by the API. Stories support views, deletion, owner archive and Highlights. Posts support three profile pins, archive and Recently Deleted with a 30-day restore window. Direct messages support read status and unsend; recipients must follow the sender. Activity, content reports, admin moderation, session management and a bounded profile/content export have working UI/API paths.

Google, Facebook, phone OTP and ChatGPT/OIDC sign-in implementations require actual provider registration/configuration. Unconfigured providers are hidden; no credentials or fabricated OTPs are included. Email matches never automatically merge accounts. Linking an OAuth provider requires an authenticated session created within the last five minutes.

Read [the feature matrix](docs/FEATURE-MATRIX.md) before describing the product to a buyer. This is a release candidate, not a claim of complete Instagram parity or Meta-scale infrastructure.

## Run locally

Requirements: Node >=22.13, MySQL 8 or MariaDB 10.11, a private S3-compatible bucket, and FFmpeg/FFprobe for video uploads.

```sh
cp .env.example .env
npm ci
npm run db:migrate
npm run dev
```

Fill `.env` before running migrations. Set `PUBLIC_APP_URL` to the exact browser origin; the default is `http://localhost:3000`. This server targets a persistent Node deployment such as Render or a container host. Static hosting alone does not run the API; long media processing is unsuitable for a short-lived serverless function.

For production, set an HTTPS `PUBLIC_APP_URL`, independent random `SESSION_SECRET` and `CRON_SECRET` values of at least 32 characters, database/storage configuration and your chosen provider credentials. Build with `npm run build`, then `npm start`. A Dockerfile is provided; run migrations once as a release job before starting replicas.

## Provider setup

Register exact callbacks:

- Google: `https://YOUR_DOMAIN/api/auth/google/callback`
- Facebook: `https://YOUR_DOMAIN/api/auth/facebook/callback`
- ChatGPT: `https://YOUR_DOMAIN/api/auth/chatgpt/callback`

Google uses Authorization Code + PKCE and server-verified OIDC tokens. Facebook uses server-side code exchange plus app/subject validation. Set `FACEBOOK_GRAPH_VERSION` to the version enabled for your Meta app. Phone login uses Twilio Verify, five verification attempts per challenge, send quotas and a configurable daily SMS budget. Configure Twilio spending/fraud/geo controls before exposing it. ChatGPT website login requires an approved/registered OAuth client; adding an OpenAI API key does not enable it. No ChatGPT conversation access is requested.

## Validation

```sh
npm run check
npm run lint
npm test
npm run build
npm audit --omit=dev
```

Database integration tests use **only a dedicated database named `t_social_test`**:

```sh
DATABASE_URL=mysql://USER:PASSWORD@localhost:3306/t_social_test npm run db:migrate
DATABASE_URL=mysql://USER:PASSWORD@localhost:3306/t_social_test npm run test:integration
```

These tests delete test users and related rows. Never point them at customer data. See `docs/VALIDATION.md` for actual release results and test boundaries.

## Operations

- `GET /api/healthz`: process liveness.
- `GET /api/readyz`: database readiness.
- `POST /api/cron/maintenance`: invoke hourly with `Authorization: Bearer CRON_SECRET`. It purges expired authentication records, abandoned uploads and posts deleted over 30 days ago, and retries object cleanup.

S3 objects are private. The database stores object keys rather than signed URLs. Image uploads are decoded, resized, stripped of metadata and encoded to WebP. Supported video uploads (20 MB, 60 seconds maximum) are converted to H.264/AAC MP4. A deployment needs both FFmpeg executables and sufficient CPU/memory. Move processing into a queue-backed worker pool before large-scale use.

Assign an admin only through a controlled database administration process after the owner signs in. The browser cannot change roles. All report review endpoints enforce the admin role.

## Ownership and sale

Application source modifications are intended for Timzee Corp. The supplied archive did not contain a verified license/provenance statement, so no unsupported ownership transfer or blanket license is asserted. The project is intentionally `private` in package metadata and has no open-source application license. Third-party packages retain their own licenses. Review dependency notices and media/music rights before selling or distributing the product. Do not advertise proprietary Instagram infrastructure or features listed as missing in the feature matrix.
