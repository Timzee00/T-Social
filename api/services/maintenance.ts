import { and, eq, lt, sql } from "drizzle-orm";
import { getDb } from "../queries/connection";
import {
  posts,
  postMedia,
  uploads,
  mediaCleanup,
  authTransactions,
  sessions,
  rateLimits,
} from "../../db/schema";
import { storage } from "./storage";
export async function runMaintenance() {
  const db = getDb();
  let cleaned = 0;
  await db.transaction(async tx => {
    const expired = await tx
      .select()
      .from(uploads)
      .where(lt(uploads.expiresAt, new Date()))
      .limit(100)
      .for("update", { skipLocked: true });
    for (const row of expired) {
      await tx
        .insert(mediaCleanup)
        .values({ key: row.key })
        .onDuplicateKeyUpdate({ set: { key: row.key } });
      await tx.delete(uploads).where(eq(uploads.id, row.id));
    }
    const deleted = await tx
      .select()
      .from(posts)
      .where(lt(posts.deletedAt, new Date(Date.now() - 30 * 86400000)))
      .limit(100)
      .for("update", { skipLocked: true });
    for (const post of deleted) {
      const media = await tx
        .select()
        .from(postMedia)
        .where(eq(postMedia.postId, post.id));
      for (const key of new Set([post.imageKey, ...media.map(m => m.key)]))
        await tx
          .insert(mediaCleanup)
          .values({ key })
          .onDuplicateKeyUpdate({ set: { key } });
      await tx.delete(posts).where(eq(posts.id, post.id));
    }
  });
  const jobs = await db.select().from(mediaCleanup).limit(50);
  for (const job of jobs) {
    try {
      await storage.deleteFile({ fileKey: job.key });
      await db
        .delete(mediaCleanup)
        .where(and(eq(mediaCleanup.id, job.id), eq(mediaCleanup.key, job.key)));
      cleaned++;
    } catch {
      console.warn(
        JSON.stringify({ event: "media_cleanup_retry", jobId: job.id })
      );
    }
  }
  for (const table of [authTransactions, sessions, rateLimits])
    await db.execute(
      sql`DELETE FROM ${table} WHERE ${table.expiresAt} < ${new Date()} LIMIT 500`
    );
  return { cleaned };
}
