# Release validation

This review covered the reconstructed source from the original supplied ZIP. The earlier expanded release archives were unavailable. The prior repository README remains in Git history; its broader feature claims are superseded by the current feature matrix.

## Local results

| Check                      | Result                    | Coverage                                                                                                                                                                                                                |
| -------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript                 | Passed                    | Browser, API, database, tests and runner configuration                                                                                                                                                                  |
| ESLint and Prettier        | Passed                    | Maintained source and configuration                                                                                                                                                                                     |
| Unit suite                 | 15 passed                 | Real signed OIDC tokens, state/origin boundaries, identity namespaces, input limits, actual image normalization and short-video transcoding                                                                             |
| Database integration suite | 19 passed                 | Real MariaDB: ownership, private accounts, bilateral blocks, session expiry/revocation, concurrent upload claims/likes/pins/rate limits, Highlights/viewer privacy, cleanup retries, moderation and idempotent deletion |
| Browser suite              | 14 passed                 | Chromium: route layouts, uploads/carousels, likes/comments/saves, private follow approval, Stories/Highlights, archive/restore, failed-feed retry, two-account messaging/read receipts/unsend and logout                |
| Production smoke           | Passed                    | Built Node server, liveness/readiness, CSP/HSTS/frame/cache headers, SPA routing, API 404, Origin rejection and production session-cookie attributes                                                                    |
| Dependency audit           | 0 known vulnerabilities   | Full dependency tree, including development tools, at review time                                                                                                                                                       |
| Source credential review   | No live credentials found | Provider/storage configuration is server-only; example/test values are deliberately inert                                                                                                                               |

Local tools: Node 24.19.0, MariaDB 10.11.14, FFmpeg 6.1.1, Playwright 1.62.1 and Chrome Headless Shell 154.0.8037.92. Browser routes were exercised at **320, 375, 768, 1024 and 1440 px**, with checks for document overflow and uncaught JavaScript errors. Long unbroken profile/caption/highlight text, a non-square avatar, dialog dismissal and narrow-screen login controls were included. Mobile profile and desktop feed screenshots were visually inspected.

## Reproduce

Use Node >=22.13 and FFmpeg/FFprobe. Install with `npm ci`; run `npm run check`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build` and `npm audit`.

For database, production and browser tests, use **a disposable database named `t_social_test`**. The suites delete test data and seed accounts. Set `DATABASE_URL` to that database and run:

```sh
npm run db:migrate
npm run test:integration
npm run test:production
npx playwright install --with-deps chromium
PUBLIC_APP_URL=http://localhost:3000 \
S3_BUCKET=t-social-test S3_REGION=us-east-1 \
S3_ENDPOINT=http://127.0.0.1:9000 S3_FORCE_PATH_STYLE=true \
S3_ACCESS_KEY_ID=test-only S3_SECRET_ACCESS_KEY=test-only \
npm run test:browser
```

The browser runner starts a local storage emulator and development server. Its two seeded accounts are fixtures, not a login bypass in the deployed app. The test-only storage emulator intentionally omits S3 authentication and must never be deployed. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an independently installed Chromium binary. GitHub Actions is configured to repeat these checks with Node 22 and MySQL 8.

## Limits of the result

Integration storage operations and SMS verification use controlled mocks. Browser uploads use the real application processing/claim flow with a local S3-compatible emulator. OIDC signature tests use locally generated RSA keys. Login controls use mocked provider availability in one UI test; no live Google, Facebook, OpenAI or Twilio account was exercised. Actual client registration, callback approval, provider consent/denial and production delivery remain acceptance work.

The production smoke test runs the actual compiled server locally with production settings; it does not verify a deployed TLS proxy, real bucket permissions, IAM policies or cloud network configuration. No Docker image build, mobile Safari/Firefox test, sustained load/chaos test, backup restoration, complete accessibility certification or independent penetration test was performed. Passing tests and a clean dependency audit do not prove the absence of all bugs or vulnerabilities.

Before selling this as a production service, complete live-provider/deployment acceptance tests, backup restoration and capacity testing, then resolve the operational and product gaps in [the security review](SECURITY-REVIEW.md) and [feature matrix](FEATURE-MATRIX.md).
