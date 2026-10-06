import * as cookie from "cookie";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../queries/connection";
import { sessions, users, securityEvents } from "../../db/schema";
import { digest, randomToken } from "./security";
import { env } from "../lib/env";
export const sessionCookie = env.isProduction
  ? "__Host-t_session"
  : "t_session";
export const cookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: "lax" as const,
  path: "/",
};
export async function createSession(userId: number, agent: string) {
  const token = randomToken();
  await getDb().transaction(async tx => {
    await tx.insert(sessions).values({
      userId,
      tokenHash: digest(token),
      agent: agent.slice(0, 250),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    });
    await tx
      .insert(securityEvents)
      .values({ userId, event: "session_created" });
  });
  return cookie.serialize(sessionCookie, token, {
    ...cookieOptions,
    maxAge: 7 * 86400,
  });
}
export async function authenticate(headers: Headers) {
  const token = cookie.parse(headers.get("cookie") || "")[sessionCookie];
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
  const [row] = await getDb()
    .select({ user: users, session: sessions })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, digest(token)),
        gt(sessions.expiresAt, new Date())
      )
    )
    .limit(1);
  return row;
}
export async function revokeCurrent(headers: Headers) {
  const token = cookie.parse(headers.get("cookie") || "")[sessionCookie];
  if (token)
    await getDb().transaction(async tx => {
      const [row] = await tx
        .select({ userId: sessions.userId })
        .from(sessions)
        .where(eq(sessions.tokenHash, digest(token)))
        .for("update");
      if (row) {
        await tx.delete(sessions).where(eq(sessions.tokenHash, digest(token)));
        await tx
          .insert(securityEvents)
          .values({ userId: row.userId, event: "session_logged_out" });
      }
    });
}
export const clearSessionCookie = () =>
  cookie.serialize(sessionCookie, "", { ...cookieOptions, maxAge: 0 });
