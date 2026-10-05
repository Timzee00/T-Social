import fs from "node:fs/promises";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { getDb, closeDb } from "../../api/queries/connection";
import { resolveAccount } from "../../api/auth/accounts";
import { createSession } from "../../api/auth/sessions";
import { users, profiles, posts, postMedia, rateLimits } from "../../db/schema";
import { storage } from "../../api/services/storage";
export default async function setup() {
  if (!process.env.DATABASE_URL?.split("?")[0].endsWith("/t_social_test"))
    throw new Error("Browser tests require t_social_test");
  const db = getDb();
  await db.delete(users);
  await db.delete(rateLimits);
  const accounts: Record<string, { id: number; cookie: string }> = {};
  for (const name of ["alice", "bob"]) {
    const id = await resolveAccount({
      provider: "test",
      issuer: "test",
      client: "test",
      subject: name,
      name,
      email: null,
    });
    await db
      .update(profiles)
      .set({
        username: name,
        displayName: name === "alice" ? "Alice Timzee" : "Bob",
        bio:
          "A long profile biography with enough detail to check wrapping and mobile layouts. " +
          "unbroken".repeat(25),
      })
      .where(eq(profiles.userId, id));
    accounts[name] = {
      id,
      cookie: (await createSession(id, "Browser test")).split(";")[0],
    };
  }
  const avatar = await storage.uploadFile({
    fileContent: await sharp({
      create: { width: 60, height: 90, channels: 3, background: "#c87552" },
    })
      .webp()
      .toBuffer(),
    fileName: "fixtures/avatar.webp",
    contentType: "image/webp",
  });
  await db
    .update(profiles)
    .set({ avatarKey: avatar.key })
    .where(eq(profiles.userId, accounts.alice.id));
  const image = await sharp({
    create: { width: 600, height: 600, channels: 3, background: "#3d7768" },
  })
    .webp()
    .toBuffer();
  const media = await storage.uploadFile({
    fileContent: image,
    fileName: "fixtures/first.webp",
    contentType: "image/webp",
  });
  const [post] = await db.insert(posts).values({
    userId: accounts.alice.id,
    imageKey: media.key,
    caption:
      "A real browser-test post with a caption. " + "longword".repeat(15),
    altText: "A green sample image",
  });
  await db.insert(postMedia).values({
    postId: post.insertId,
    key: media.key,
    contentType: "image/webp",
    position: 0,
  });
  await fs.mkdir("test-results", { recursive: true });
  await fs.writeFile("test-results/accounts.json", JSON.stringify(accounts));
  await fs.writeFile(
    "test-results/upload.png",
    await sharp({
      create: { width: 20, height: 20, channels: 3, background: "#e8a56b" },
    })
      .png()
      .toBuffer()
  );
  await closeDb();
}
