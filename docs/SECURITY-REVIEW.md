# Security review

Scope: supplied source, modified source, local API, dedicated disposable database and local browser tests. No live provider accounts, public deployment or customer data were tested.

Threat model: anonymous clients, signed-in users attacking other users' resources, cross-site login/mutation requests, malicious uploads, concurrent duplicate actions, stale sessions and unauthorized moderation. Trusted boundaries: app server, DB administration, provider issuers, private S3 bucket and the reverse proxy that supplies any configured client IP header.

| Confirmed source issue                              | Impact                                                 | Implemented fix                                                                                     | Regression evidence                                                            |
| --------------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Base64 redirect used as OAuth state                 | Login-CSRF and callback substitution                   | Browser-bound random transaction, fixed callback, TTL and atomic one-time consumption               | Callback mismatch, denial and replay integration test                          |
| Year-long client JWT without revocation             | Stolen sessions survive logout                         | Random tokens stored only as hashes, 7-day expiry, server revocation                                | Logout and other-account revoke tests                                          |
| Client-supplied content type and filename extension | Invalid/active files and unsafe rendering              | Multipart upload; real decode; bounded image normalization; bounded FFprobe/FFmpeg video processing | Invalid MIME, SVG and video checks; browser media flow                         |
| Weak interaction constraints                        | Duplicate likes/follows/saves and orphan references    | Unique pairs, foreign keys and idempotent mutation handling                                         | Concurrent likes and invalid-reference insertion                               |
| No unified privacy enforcement                      | Private/blocked content exposed through alternate APIs | Shared author/post checks on reads and interactions                                                 | Feed, profile, explore, saved, single-post, comments and bilateral block tests |
| Missing upload ownership                            | Cross-user or repeated use of uploaded objects         | Owned, purpose-scoped expiring records, consumed under row locks                                    | Ownership, wrong purpose and simultaneous claim tests                          |
| Public mutations lacked origin validation           | Cookie-authenticated CSRF                              | Exact configured Origin checks and SameSite cookies                                                 | Cross-site request test                                                        |
| API/database errors exposed internals               | Query/schema information disclosure                    | Generic internal-error response, no stack; redacted structured logging                              | Middleware inspection and HTTP regression                                      |
| Shared post URL had no route                        | Broken content navigation                              | Real authorized post route                                                                          | Build/router inspection and browser navigation                                 |
| Owner could restore moderator removal               | Moderation bypass                                      | Persistent moderated flag checked on restore                                                        | Admin remove/owner restore rejection                                           |

## Operational boundaries

The deeper review also corrected a repeated-delete bypass of the 30-day restore window. Deletion now preserves the first deletion timestamp. Restore/pin operations lock and validate the current post, and visible-post queries independently exclude moderated content. Regression tests cover repeat deletion, concurrent pin limits and moderator-removal protection. Notification writes share transactions with their interactions so retries do not duplicate activity entries.

- OAuth and SMS provider acceptance tests require registered clients and test accounts. Cryptographic validator tests use locally signed tokens, not real Google/Meta/OpenAI sign-ins.
- Two-minute signed media URLs remain readable until expiry if access is subsequently revoked. Immediate media revocation needs an authorization gateway or CDN token invalidation.
- Media is processed inline with strict limits; before traffic growth, use isolated workers, queues, per-instance concurrency controls and maintained FFmpeg/system packages. Automatic content moderation is not implemented.
- SQL-backed rate limits coordinate replicas. A configured proxy IP header must be overwritten by a trusted proxy; never trust a raw client-supplied forwarded header. Add infrastructure/WAF protection and SMS provider fraud/spending controls before public exposure.
- Cleanup retries do not make database and object storage atomic. A process dying between S3 upload and DB recording can leave an orphan object; use scheduled object reconciliation and retention policies.
- The export covers profile and bounded content rows, not complete GDPR-style portability. App-managed MFA, full account recovery/deletion, moderation appeals and age/parental controls remain gaps.
- No sustained load/chaos test or backup restoration was performed. No Meta-scale claim is made.
