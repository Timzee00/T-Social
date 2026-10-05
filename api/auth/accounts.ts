import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { authIdentities, profiles, users } from "../../db/schema";
import { getDb } from "../queries/connection";
import { identityHash, randomToken } from "./security";
export async function resolveAccount(
  identity: {
    provider: string;
    issuer: string;
    client: string;
    subject: string;
    name: string | null;
    email: string | null;
  },
  linkUserId?: number | null
) {
  const subjectHash = identityHash(
    identity.provider,
    identity.issuer,
    identity.client,
    identity.subject
  );
  const lookup = () =>
    getDb()
      .select()
      .from(authIdentities)
      .where(
        and(
          eq(authIdentities.provider, identity.provider),
          eq(authIdentities.subjectHash, subjectHash)
        )
      )
      .limit(1);
  const [existing] = await lookup();
  if (existing) {
    if (linkUserId && existing.userId !== linkUserId)
      throw new TRPCError({
        code: "CONFLICT",
        message: "This sign-in method belongs to another account",
      });
    return existing.userId;
  }
  try {
    return await getDb().transaction(async tx => {
      let userId = linkUserId;
      if (!userId) {
        const [result] = await tx.insert(users).values({
          unionId: `local:${randomToken()}`,
          name: identity.name,
          email: identity.email,
        });
        userId = result.insertId;
        await tx.insert(profiles).values({
          userId,
          username: `user_${userId}`,
          displayName: identity.name || "New member",
        });
      }
      await tx
        .insert(authIdentities)
        .values({ userId, provider: identity.provider, subjectHash });
      return userId;
    });
  } catch (error) {
    // Concurrent first logins may race; uniqueness rolls back the losing account creation.
    const [winner] = await lookup();
    if (winner && (!linkUserId || winner.userId === linkUserId))
      return winner.userId;
    throw error;
  }
}
