import { getDb } from "../../api/queries/connection";
import * as s from "../../db/schema";
// Never disable foreign keys. Financial retention is relaxed only by explicitly deleting fixtures in the dedicated test database.
export async function resetTestDatabase() {
  if (!process.env.DATABASE_URL?.split("?")[0].endsWith("/t_social_test"))
    throw new Error("Fixture reset requires t_social_test");
  const db = getDb();
  for (const table of [
    s.walletEntries,
    s.walletJournal,
    s.gifts,
    s.subscriptions,
    s.withdrawals,
    s.cashFunding,
    s.rewardCampaigns,
    s.walletAccounts,
    s.securityEvents,
    s.users,
    s.rateLimits,
    s.mediaCleanup,
  ])
    await db.delete(table);
}
