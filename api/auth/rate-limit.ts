import { eq, sql } from "drizzle-orm";
import { rateLimits } from "../../db/schema";
import { getDb } from "../queries/connection";
import { keyedHash } from "./security";
import { env } from "../lib/env";
// Database-backed windows coordinate all API instances. SQL row locks prevent lost increments.
export async function allowRequest(key: string, maximum: number, seconds = 60) {
  const bucket = Math.floor(Date.now() / (seconds * 1000));
  const hashed = keyedHash(env.sessionSecret, `${key}:${bucket}`);
  return getDb().transaction(async tx => {
    await tx
      .insert(rateLimits)
      .values({
        key: hashed,
        hits: 1,
        expiresAt: new Date((bucket + 1) * seconds * 1000),
      })
      .onDuplicateKeyUpdate({ set: { hits: sql`${rateLimits.hits} + 1` } });
    const [row] = await tx
      .select()
      .from(rateLimits)
      .where(eq(rateLimits.key, hashed));
    return row.hits <= maximum;
  });
}
