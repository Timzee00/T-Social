# T Coin wallet design and operating boundaries

## Product rule

T Social uses **virtual T Coins only**. A T Coin is an in-app social credit, not money, stored value, a deposit, a bank balance or a claim on Timzee Corp. T Coins have no naira exchange rate and cannot be withdrawn, redeemed for cash or converted into another currency.

The active application has no payment-provider webhook, funding checkout, bank-recipient workflow, KYC-for-payout flow, cash campaign, NGN balance or withdrawal endpoint. Provider secrets are not part of the runtime configuration.

## What members can do

Members can:

- claim bounded one-time T Coin rewards for supported product tasks;
- send virtual T Coins to another T Social member;
- gift T Coins to a creator or a creator post;
- spend 200 T Coins on a 30-day supporter record;
- review their virtual coin transaction history.

These actions never create a real-money entitlement. Product copy must continue to make that boundary visible wherever a user could reasonably confuse a virtual balance with cash.

## Accounting model

T Coins use a double-entry application ledger. Every transfer has two equal and opposite entries in the COIN currency. Account balances and journal entries are written in the same database transaction.

Important invariants:

- transfer amounts are positive safe integers;
- user balances cannot go below zero;
- unique request references make retries idempotent;
- replayed references must match the original accounts, amount and transaction kind;
- wallet accounts are locked in a stable order to reduce deadlocks;
- bounded retries handle database lock/deadlock failures;
- only the explicit platform issuance account may run negative to mint product credits;
- users cannot edit or delete ledger journal records through the application.

The current schema still retains historical migration definitions for previously prototyped wallet tables/currency values so existing installations can migrate safely, but the application no longer exposes or mounts those real-money flows. Do not re-enable them by configuration.

## Administration

Administrators have a virtual-coin control screen that can grant T Coins to an existing user with:

- a bounded positive amount;
- a human-readable reason;
- an idempotent request key;
- a ledger entry from the platform issuance account.

Administrative grants should be used for product support, promotions or corrections that are explicitly virtual. They must never be described as salary, cash, withdrawable earnings or a guaranteed monetary reward.

The admin audit checks cached COIN balances against accumulated ledger entries and verifies that each COIN journal balances to zero with two entries. As the ledger grows, move this full scan to a paginated/offline reconciliation job rather than running an unbounded administrative request.

## Scaling notes

The shared issuance account is intentionally simple and is not a billion-user wallet architecture. Before very large scale:

- partition or isolate wallet workloads from general social traffic;
- add queue/outbox handling for reward side effects;
- measure lock contention and ledger write throughput;
- build paginated reconciliation and anomaly alerts;
- introduce explicit rate limits for peer transfers and administrative grants;
- add product-level anti-abuse rules for farming reward tasks;
- test backup/restore and idempotent replay behavior under failure.

None of those scaling improvements should change the core product rule: **T Coins remain virtual-only and non-redeemable.**
