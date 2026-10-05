import { and, eq, ne, gt } from "drizzle-orm";
import { z } from "zod";
import { createRouter, authedQuery, publicQuery } from "./middleware";
import { clearSessionCookie, revokeCurrent } from "./auth/sessions";
import { sessions, authIdentities } from "../db/schema";
import { getDb } from "./queries/connection";
export const authRouter = createRouter({
  me: publicQuery.query(({ ctx }) =>
    ctx.user
      ? { id: ctx.user.id, name: ctx.user.name, role: ctx.user.role }
      : null
  ),
  logout: publicQuery.mutation(async ({ ctx }) => {
    await revokeCurrent(ctx.req.headers);
    ctx.resHeaders.append("set-cookie", clearSessionCookie());
    return { success: true };
  }),
  sessions: authedQuery.query(({ ctx }) =>
    getDb()
      .select({
        id: sessions.id,
        agent: sessions.agent,
        createdAt: sessions.createdAt,
        expiresAt: sessions.expiresAt,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.userId, ctx.user.id),
          gt(sessions.expiresAt, new Date())
        )
      )
      .then(rows =>
        rows.map(row => ({ ...row, current: row.id === ctx.session?.id }))
      )
  ),
  revokeSession: authedQuery
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await getDb()
        .delete(sessions)
        .where(
          and(eq(sessions.id, input.id), eq(sessions.userId, ctx.user.id))
        );
      if (input.id === ctx.session?.id)
        ctx.resHeaders.append("set-cookie", clearSessionCookie());
      return { ok: true };
    }),
  logoutOthers: authedQuery.mutation(async ({ ctx }) => {
    await getDb()
      .delete(sessions)
      .where(
        and(eq(sessions.userId, ctx.user.id), ne(sessions.id, ctx.session!.id))
      );
    return { ok: true };
  }),
  identities: authedQuery.query(({ ctx }) =>
    getDb()
      .select({ provider: authIdentities.provider })
      .from(authIdentities)
      .where(eq(authIdentities.userId, ctx.user.id))
  ),
});
