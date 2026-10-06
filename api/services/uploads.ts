import { and, eq, gt, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { uploads } from "../../db/schema";
import type { MySql2Database } from "drizzle-orm/mysql2";
import * as schema from "../../db/schema";
export async function claimUploads(
  tx: Pick<MySql2Database<typeof schema>, "select" | "delete">,
  ids: string[],
  userId: number,
  purpose: "post" | "avatar" | "story" | "chat" | "instant"
) {
  if (new Set(ids).size !== ids.length)
    throw new TRPCError({ code: "BAD_REQUEST", message: "Duplicate upload" });
  const rows = await tx
    .select()
    .from(uploads)
    .where(
      and(
        inArray(uploads.id, ids),
        eq(uploads.userId, userId),
        eq(uploads.purpose, purpose),
        gt(uploads.expiresAt, new Date())
      )
    )
    .for("update");
  if (rows.length !== ids.length)
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Upload expired or unavailable. Choose the file again.",
    });
  await tx.delete(uploads).where(inArray(uploads.id, ids));
  return ids.map(id => rows.find(r => r.id === id)!);
}
