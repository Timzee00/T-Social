# Public launch and scaling assessment

**Decision: not approved for a millions/billions-user public launch. Live cash is disabled by default.** The code has useful working features and local regression evidence; that is not a deployment, capacity certification, independent penetration test or regulated financial approval.

## Evidence and immediate boundaries

Local tests exercise ownership/privacy across alternative surfaces, real database transactions, race conditions, media normalization, browser workflows and production HTTP headers. Real OAuth registrations, SMS delivery, payment-provider accounts, cloud S3 permissions, production networks, actual KYC and multi-region operations have not been exercised. Group calls and licensed music are not implemented; recommendations are a bounded heuristic. The feature matrix lists all remaining gaps.

The local read diagnostic uses 30 concurrent authenticated requests and 1000 synthetic posts with mocked signing/storage. It is a small correctness/latency sample, not a sustained HTTP traffic test. It excludes internet latency, millions of follows/likes, realistic social graphs, real object delivery and provider failure behavior. Its output is `qa-results/read-load.json` when the integration suite runs.

## Why user count alone is not capacity

This deployment has a Node API, a ten-connection SQL pool, private object storage and polling clients. Group/direct message polling every five seconds would create approximately **200,000 message-history requests per second if one million users were simultaneously viewing chats**, before other queries. This follows from 1,000,000 / 5; it is a demand calculation, not measured capacity. At a billion concurrent chat viewers it would be 200 million per second. Account counts and concurrent active users are different measures.

Aggregate counts currently scan relevant SQL rows. Creator analytics and the financial audit use bounded content views or accumulated ledger scans. Public feed filtering uses indexed relational permissions; SQL quotas and shared platform ledger accounts also create write contention. Image/video decoding is limited to two in-flight uploads per process, but it still occupies API resources. The wallet's shared coin issuance and cash campaign rows intentionally serialize financial changes. None of these is an appropriate claim of billion-user architecture.

## Required before an invited staging pilot

- Deploy to controlled staging with HTTPS, exact origins, private bucket/IAM, trusted proxy configuration and separate secrets; test cloud permissions and callbacks.
- Verify signup, consent cancellation, linking, logout, recovery and SMS spending controls against real registered providers.
- Keep cash OFF until provider sandbox end-to-end testing, approved identity workflow, payout-name matching, reconciliation, fee/liquidity checks and independent financial/security review are complete.
- Establish terms, privacy/retention, complete export/deletion, age/child-safety rules, copyright handling, report triage, support and incident ownership. Financial retention needs a documented policy rather than deleting ledger history.
- Test backup restore, object reconciliation, cron execution, alerting and operational rollback. Run the workflow after the existing GitHub account billing lock is resolved.

## Infrastructure roadmap for growth

| Workstream      | Required design and validation                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Delivery        | Stateless API replicas, edge protection and quotas, private-media CDN or authorized gateway, independent object delivery capacity and immediate revocation where needed.                      |
| Messaging       | WebSocket/event delivery, durable outbox and workers, reconnect/replay semantics, permission revocation and load/partition tests; replace user-scale polling.                                 |
| Media           | Isolated queued workers, bounded resource budgets, safety scanning, multiple bitrate streaming/transcoding, object lifecycle reconciliation and retry/dead-letter controls.                   |
| Feed and search | Feed fanout/ranking services, materialized counters, search index, permission-aware cache invalidation and user-controlled recommendation signals.                                            |
| Data            | Measured indexes/query plans, replicas, partitioning/sharding by workload, transactional wallet boundary, retention policies, tested failover and restore.                                    |
| Wallet          | Isolated financial service boundary, validated merchant/identity integration, budgets/limits, risk review, two-person approvals, daily provider reconciliation and dispute/refund operations. |
| Operations      | Service-level objectives, realistic request mix, long-running load tests, traffic spikes, bot traffic, slow provider/SQL/storage tests and measured recovery times.                           |
| People          | Abuse/report operations, account recovery, customer support, on-call response and qualified security/financial review.                                                                        |

Capacity approval must use measured throughput, latency, error rate, saturation, queue depth, cost and recovery against representative traffic and data. Increase rollout only after those measurements and operating controls pass. No extrapolation from the local sample is a valid million-user approval.
