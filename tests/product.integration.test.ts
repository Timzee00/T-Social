import {
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { resetTestDatabase } from "./helpers/reset";
import { createTRPCClient, httpLink } from "@trpc/client";
import superjson from "superjson";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import * as schema from "../db/schema";
import { getDb, closeDb } from "../api/queries/connection";
import { createSession, authenticate } from "../api/auth/sessions";
import { resolveAccount } from "../api/auth/accounts";
import { allowRequest } from "../api/auth/rate-limit";
import { digest, randomToken } from "../api/auth/security";
import { storage } from "../api/services/storage";
import { runMaintenance } from "../api/services/maintenance";
import app from "../api/boot";
import type { AppRouter } from "../api/router";
vi.mock("../api/services/storage", () => ({
  storage: {
    getPresignedUrls: vi.fn(async ({ keys }: { keys: string[] }) => ({
      urls: keys.map(key => `https://media.example/${key}`),
    })),
    deleteFile: vi.fn(async () => {}),
    uploadFile: vi.fn(async () => ({ key: "new.webp" })),
  },
}));
let alice: number, bob: number, carol: number, postId: number;
let cookies: Record<number, string> = {};
const client = (userId?: number, origin = "http://localhost:3000") =>
  createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: "http://localhost:3000/api/trpc",
        transformer: superjson,
        fetch: async (input, init) =>
          app.request(String(input), {
            ...init,
            headers: {
              ...Object.fromEntries(new Headers(init?.headers)),
              origin,
              ...(userId ? { cookie: cookies[userId] } : {}),
            },
          }),
      }),
    ],
  });
async function upload(
  userId: number,
  purpose: "post" | "avatar" | "story" = "post"
) {
  const id = randomToken();
  await getDb()
    .insert(schema.uploads)
    .values({
      id,
      userId,
      purpose,
      key: `${id}.webp`,
      contentType: "image/webp",
      expiresAt: new Date(Date.now() + 60000),
    });
  return id;
}
beforeAll(() => {
  if (!process.env.DATABASE_URL?.split("?")[0].endsWith("/t_social_test"))
    throw new Error(
      "Integration tests require a dedicated t_social_test database"
    );
});
beforeEach(async () => {
  const db = getDb();
  await resetTestDatabase();
  await db.delete(schema.rateLimits);
  await db.delete(schema.mediaCleanup);
  cookies = {};
  const identity = (name: string) => ({
    provider: "test",
    issuer: "test",
    client: "test",
    subject: name,
    name,
    email: `${name}@example.test`,
  });
  alice = await resolveAccount(identity("alice"));
  bob = await resolveAccount(identity("bob"));
  carol = await resolveAccount(identity("carol"));
  for (const user of [alice, bob, carol])
    cookies[user] = (await createSession(user, "Integration test")).split(
      ";"
    )[0];
  postId = (
    await client(alice).social.createPost.mutate({
      uploadIds: [await upload(alice)],
      caption: "A real post",
    })
  ).id;
});
afterAll(closeDb);
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("privacy, ownership, sessions and concurrency against MySQL", () => {
  it("rejects anonymous writes and cross-site mutation requests", async () => {
    await expect(
      client().social.like.mutate({ postId, like: true })
    ).rejects.toThrow();
    await expect(
      client(bob, "https://evil.example").social.like.mutate({
        postId,
        like: true,
      })
    ).rejects.toThrow();
    expect(await client(alice).social.feed.query({ limit: 1 })).toHaveLength(1);
  });
  it("prevents private posts leaking through feed, explore, profile, single-post, comments, saved and interactions", async () => {
    await client(bob).social.save.mutate({ postId, save: true });
    await client(alice).features.privacy.mutate({ isPrivate: true });
    expect(await client(bob).social.feed.query({ limit: 30 })).toEqual([]);
    expect(await client(bob).social.explore.query()).toEqual([]);
    expect(
      await client(bob).social.userPosts.query({ username: `user_${alice}` })
    ).toEqual([]);
    expect(await client(bob).social.saved.query()).toEqual([]);
    for (const action of [
      () => client(bob).social.post.query({ postId }),
      () => client(bob).social.comments.query({ postId }),
      () => client(bob).social.like.mutate({ postId, like: true }),
      () => client(bob).social.addComment.mutate({ postId, text: "hidden" }),
    ])
      await expect(action()).rejects.toThrow();
    await client(bob).social.follow.mutate({ userId: alice, follow: true });
    expect(await client(bob).social.feed.query({ limit: 30 })).toEqual([]);
    await client(alice).features.respondRequest.mutate({
      userId: bob,
      accept: true,
    });
    expect(await client(bob).social.feed.query({ limit: 30 })).toHaveLength(1);
  });
  it("enforces bilateral blocks and removes both follow relationships", async () => {
    await client(bob).social.follow.mutate({ userId: alice, follow: true });
    await client(alice).social.follow.mutate({ userId: bob, follow: true });
    await client(alice).features.block.mutate({ userId: bob, block: true });
    expect(await client(bob).social.feed.query({ limit: 30 })).toEqual([]);
    await expect(
      client(bob).social.profile.query({ username: `user_${alice}` })
    ).rejects.toThrow();
    await expect(
      client(alice).features.sendMessage.mutate({
        userId: bob,
        text: "blocked",
      })
    ).rejects.toThrow();
    expect(await getDb().select().from(schema.follows)).toHaveLength(0);
  });
  it("enforces media purpose, ownership and single-use claims even concurrently", async () => {
    const owned = await upload(alice);
    await expect(
      client(bob).social.createPost.mutate({ uploadIds: [owned] })
    ).rejects.toThrow();
    const avatar = await upload(alice, "avatar");
    await expect(
      client(alice).social.createPost.mutate({ uploadIds: [avatar] })
    ).rejects.toThrow();
    const results = await Promise.allSettled([
      client(alice).social.createPost.mutate({ uploadIds: [owned] }),
      client(alice).social.createPost.mutate({ uploadIds: [owned] }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
  });
  it("keeps interaction uniqueness and relational integrity under concurrent requests", async () => {
    await Promise.all(
      Array.from({ length: 8 }, () =>
        client(bob).social.like.mutate({ postId, like: true })
      )
    );
    expect(await getDb().select().from(schema.likes)).toHaveLength(1);
    expect(
      await getDb()
        .select()
        .from(schema.notifications)
        .where(eq(schema.notifications.kind, "like"))
    ).toHaveLength(1);
    await expect(
      getDb().insert(schema.likes).values({ userId: bob, postId: 99999999 })
    ).rejects.toThrow();
  });
  it("enforces post and comment ownership, archive visibility and restore window", async () => {
    await expect(
      client(bob).social.deletePost.mutate({ postId })
    ).rejects.toThrow();
    await client(bob).social.addComment.mutate({ postId, text: "hello" });
    const [comment] = await getDb().select().from(schema.comments);
    await expect(
      client(carol).features.deleteComment.mutate({ commentId: comment.id })
    ).rejects.toThrow();
    await client(alice).features.deleteComment.mutate({
      commentId: comment.id,
    });
    await client(alice).features.managePost.mutate({
      postId,
      action: "archive",
    });
    expect(await client(bob).social.feed.query({ limit: 30 })).toEqual([]);
    await client(alice).features.managePost.mutate({
      postId,
      action: "unarchive",
    });
    await client(alice).social.deletePost.mutate({ postId });
    await client(alice).features.managePost.mutate({
      postId,
      action: "restore",
    });
    expect(await client(bob).social.feed.query({ limit: 30 })).toHaveLength(1);
    await getDb()
      .update(schema.posts)
      .set({ deletedAt: new Date(Date.now() - 31 * 86400000) })
      .where(eq(schema.posts.id, postId));
    await client(alice).social.deletePost.mutate({ postId });
    await expect(
      client(alice).features.managePost.mutate({ postId, action: "restore" })
    ).rejects.toThrow();
  });
  it("respects feed limits and deterministic cursor pagination", async () => {
    await client(alice).social.createPost.mutate({
      uploadIds: [await upload(alice)],
    });
    const first = await client(bob).social.feed.query({ limit: 1 });
    const next = await client(bob).social.feed.query({
      limit: 1,
      before: first[0].id,
    });
    expect(first).toHaveLength(1);
    expect(next[0].id).toBe(postId);
    expect(first[0].id).not.toBe(next[0].id);
  });
  it("rejects unauthorized DMs and session revocation by another account", async () => {
    await expect(
      client(alice).features.sendMessage.mutate({
        userId: bob,
        text: "stranger",
      })
    ).rejects.toThrow();
    await client(bob).social.follow.mutate({ userId: alice, follow: true });
    await client(alice).features.sendMessage.mutate({
      userId: bob,
      text: "hello",
    });
    expect(
      await client(bob).features.conversation.query({ userId: alice })
    ).toHaveLength(1);
    expect(
      await client(carol).features.conversation.query({ userId: alice })
    ).toHaveLength(0);
    const auth = await authenticate(new Headers({ cookie: cookies[alice] }));
    await client(bob).auth.revokeSession.mutate({ id: auth!.session.id });
    expect(
      await authenticate(new Headers({ cookie: cookies[alice] }))
    ).toBeTruthy();
    await client(alice).auth.logout.mutate();
    expect(
      await authenticate(new Headers({ cookie: cookies[alice] }))
    ).toBeUndefined();
  });
  it("does not merge matching emails and handles concurrent first sign-in", async () => {
    const identity = {
      provider: "google",
      issuer: "google",
      client: "client",
      subject: "new",
      name: "same",
      email: "alice@example.test",
    };
    const [a, b] = await Promise.all([
      resolveAccount(identity),
      resolveAccount(identity),
    ]);
    expect(a).toBe(b);
    expect(a).not.toBe(alice);
    expect(await getDb().select().from(schema.users)).toHaveLength(4);
  });
  it("coordinates rate limits across concurrent requests", async () => {
    const result = await Promise.all(
      Array.from({ length: 15 }, () => allowRequest("concurrency-test", 5))
    );
    expect(result.filter(Boolean)).toHaveLength(5);
  });
  it("expires sessions on the server even while the browser still holds its cookie", async () => {
    await getDb()
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 60000) })
      .where(eq(schema.sessions.userId, alice));
    expect(
      await authenticate(new Headers({ cookie: cookies[alice] }))
    ).toBeUndefined();
    await expect(
      client(alice).social.feed.query({ limit: 1 })
    ).rejects.toThrow();
  });
  it("binds phone challenges, limits OTP attempts and rejects replay using a simulated Verify provider", async () => {
    for (const key of [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_VERIFY_SERVICE_SID",
    ])
      vi.stubEnv(key, "test-only");
    const phone = "+2348012345678";
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input, init) => {
        expect(String(input)).toMatch(
          /^https:\/\/verify\.twilio\.com\/v2\/Services\/test-only\//
        );
        const fields = new URLSearchParams(String(init?.body));
        return new Response(
          JSON.stringify({
            status: fields.has("Code")
              ? fields.get("Code") === "123456"
                ? "approved"
                : "pending"
              : "pending",
            to: phone,
          }),
          { headers: { "content-type": "application/json" } }
        );
      });
    const send = (path: string, data: unknown, cookie = "") =>
      app.request(`http://localhost:3000/api/auth/phone/${path}`, {
        method: "POST",
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
          cookie,
        },
        body: JSON.stringify(data),
      });
    expect((await send("send", null)).status).toBe(400);
    expect((await send("send", { phone: "080123" })).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
    const response = await send("send", { phone });
    const { challenge } = await response.json();
    const binding = response.headers.get("set-cookie")!.split(";")[0];
    expect(
      (
        await send(
          "verify",
          { challenge, code: "123456" },
          "t_auth_binding=wrong"
        )
      ).status
    ).toBe(400);
    for (let i = 0; i < 5; i++)
      expect(
        (await send("verify", { challenge, code: "000000" }, binding)).status
      ).toBe(400);
    expect(
      (await send("verify", { challenge, code: "123456" }, binding)).status
    ).toBe(429);
    const fresh = await send("send", { phone });
    const state = await fresh.json();
    const freshBinding = fresh.headers.get("set-cookie")!.split(";")[0];
    const signedIn = await send(
      "verify",
      { challenge: state.challenge, code: "123456" },
      freshBinding
    );
    expect(signedIn.status).toBe(200);
    expect(signedIn.headers.get("set-cookie")).toContain("HttpOnly");
    expect(
      (
        await send(
          "verify",
          { challenge: state.challenge, code: "123456" },
          freshBinding
        )
      ).status
    ).toBe(400);
  });
  it("validates actual multipart media before storing and creates an owned claim", async () => {
    const send = (file: Blob, user = alice) => {
      const data = new FormData();
      data.set("file", file, "photo.png");
      data.set("purpose", "post");
      return app.request("http://localhost:3000/api/media/upload", {
        method: "POST",
        headers: { origin: "http://localhost:3000", cookie: cookies[user] },
        body: data,
      });
    };
    vi.mocked(storage.uploadFile).mockClear();
    expect(
      (
        await send(
          new Blob(['<svg onload="alert(1)"/>'], { type: "image/png" })
        )
      ).status
    ).toBe(400);
    expect(storage.uploadFile).not.toHaveBeenCalled();
    const image = await sharp({
      create: { width: 10, height: 10, channels: 3, background: "blue" },
    })
      .png()
      .toBuffer();
    const response = await send(
      new Blob([new Uint8Array(image)], { type: "image/png" })
    );
    expect(response.status).toBe(200);
    const { uploadId, contentType } = await response.json();
    expect(contentType).toBe("image/webp");
    await expect(
      client(bob).social.createPost.mutate({ uploadIds: [uploadId] })
    ).rejects.toThrow();
    await expect(
      client(alice).social.createPost.mutate({ uploadIds: [uploadId] })
    ).resolves.toHaveProperty("id");
  });
  it("protects expired Stories, Highlights and viewer data with owner and privacy checks", async () => {
    const [story] = await getDb()
      .insert(schema.stories)
      .values({
        userId: alice,
        imageKey: "story.webp",
        createdAt: new Date(Date.now() - 2 * 86400000),
      });
    const storyId = story.insertId;
    await expect(
      client(bob).features.createHighlight.mutate({
        title: "Stolen",
        storyIds: [storyId],
      })
    ).rejects.toThrow();
    await expect(
      client(bob).features.viewStory.mutate({ storyId })
    ).rejects.toThrow();
    await client(alice).features.createHighlight.mutate({
      title: "Memories",
      storyIds: [storyId],
    });
    expect(
      await client(bob).features.highlights.query({ userId: alice })
    ).toHaveLength(1);
    await client(bob).features.viewStory.mutate({ storyId });
    expect(
      await client(alice).features.storyViewers.query({ storyId })
    ).toHaveLength(1);
    await expect(
      client(carol).features.storyViewers.query({ storyId })
    ).rejects.toThrow();
    await client(alice).features.privacy.mutate({ isPrivate: true });
    expect(
      await client(bob).features.highlights.query({ userId: alice })
    ).toEqual([]);
    await expect(
      client(bob).features.viewStory.mutate({ storyId })
    ).rejects.toThrow();
    await expect(
      client(bob).features.deleteStory.mutate({ storyId })
    ).rejects.toThrow();
  });
  it("enforces the three-pin limit under concurrent requests", async () => {
    const ids = [postId];
    for (let i = 0; i < 3; i++)
      ids.push(
        (
          await client(alice).social.createPost.mutate({
            uploadIds: [await upload(alice)],
          })
        ).id
      );
    const results = await Promise.allSettled(
      ids.map(postId =>
        client(alice).features.managePost.mutate({ postId, action: "pin" })
      )
    );
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(3);
  });
  it("retains failed storage cleanup for retry and removes expired abandoned uploads", async () => {
    const id = await upload(alice);
    await getDb()
      .update(schema.uploads)
      .set({ expiresAt: new Date(Date.now() - 60000) })
      .where(eq(schema.uploads.id, id));
    vi.mocked(storage.deleteFile).mockRejectedValueOnce(
      new Error("temporary storage outage")
    );
    await runMaintenance();
    expect(await getDb().select().from(schema.uploads)).toHaveLength(0);
    expect(await getDb().select().from(schema.mediaCleanup)).toHaveLength(1);
    await runMaintenance();
    expect(await getDb().select().from(schema.mediaCleanup)).toHaveLength(0);
  });
  it("requires admin access and prevents restoring a moderated removal", async () => {
    await client(bob).features.report.mutate({
      postId,
      reason: "Review this post",
    });
    await expect(client(bob).features.reports.query()).rejects.toThrow();
    await getDb()
      .update(schema.users)
      .set({ role: "admin" })
      .where(eq(schema.users.id, carol));
    const [report] = await client(carol).features.reports.query();
    await client(carol).features.reviewReport.mutate({
      id: report.id,
      remove: true,
    });
    await expect(
      client(alice).features.managePost.mutate({ postId, action: "restore" })
    ).rejects.toThrow();
  });
  it("requires valid browser-bound OAuth state and rejects replay before contacting a provider", async () => {
    process.env.GOOGLE_CLIENT_ID = "test-client";
    process.env.GOOGLE_CLIENT_SECRET = "test-secret";
    const state = randomToken(),
      binding = randomToken();
    await getDb()
      .insert(schema.authTransactions)
      .values({
        tokenHash: digest(state),
        provider: "google",
        bindingHash: digest(binding),
        verifier: randomToken(),
        nonce: randomToken(),
        expiresAt: new Date(Date.now() + 60000),
      });
    const wrong = await app.request(
      `http://localhost:3000/api/auth/google/callback?state=${state}&code=bad`,
      { headers: { cookie: "t_auth_binding=wrong" } }
    );
    expect(wrong.headers.get("location")).toContain("invalid_state");
    const denied = await app.request(
      `http://localhost:3000/api/auth/google/callback?state=${state}&error=access_denied`,
      { headers: { cookie: `t_auth_binding=${binding}` } }
    );
    expect(denied.headers.get("location")).toContain("cancelled");
    const replay = await app.request(
      `http://localhost:3000/api/auth/google/callback?state=${state}&error=access_denied`,
      { headers: { cookie: `t_auth_binding=${binding}` } }
    );
    expect(replay.headers.get("location")).toContain("invalid_state");
  });
  it("fails closed for missing provider configuration, cron auth and wrong HTTP method", async () => {
    delete process.env.FACEBOOK_APP_ID;
    expect(
      (
        await app.request("http://localhost:3000/api/auth/facebook/start", {
          method: "POST",
          headers: { origin: "http://localhost:3000" },
        })
      ).status
    ).toBe(503);
    expect(
      (
        await app.request("http://localhost:3000/api/cron/maintenance", {
          method: "POST",
        })
      ).status
    ).toBe(401);
    const get = await app.request(
      "http://localhost:3000/api/trpc/social.deletePost?input=" +
        encodeURIComponent(JSON.stringify({ json: { postId } })),
      { headers: { cookie: cookies[alice] } }
    );
    expect(get.status).not.toBe(200);
  });
});
