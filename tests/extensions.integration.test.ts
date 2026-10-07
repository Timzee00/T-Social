import { mkdir, writeFile } from "node:fs/promises";
import {
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { createTRPCClient, httpLink } from "@trpc/client";
import sharp from "sharp";
import superjson from "superjson";
import { eq, sql } from "drizzle-orm";
import * as s from "../db/schema";
import { getDb, closeDb } from "../api/queries/connection";
import { resolveAccount } from "../api/auth/accounts";
import { createSession } from "../api/auth/sessions";
import { randomToken } from "../api/auth/security";
import { storage } from "../api/services/storage";
import { resetTestDatabase } from "./helpers/reset";
import { ledgerTransaction, transfer, userAccount } from "../api/wallet/ledger";
import app from "../api/boot";
import type { AppRouter } from "../api/router";
vi.mock("../api/services/storage", () => ({
  storage: {
    getPresignedUrls: vi.fn(async ({ keys }: { keys: string[] }) => ({
      urls: keys.map(k => `https://media.example/${k}`),
    })),
    readFile: vi.fn(async () => Buffer.from("private-photo")),
    deleteFile: vi.fn(async () => {}),
    uploadFile: vi.fn(async () => ({ key: "photo.webp" })),
  },
}));
let alice: number, bob: number, carol: number, postId: number;
let cookies: Record<number, string> = {};
const client = (userId: number) =>
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
              origin: "http://localhost:3000",
              cookie: cookies[userId],
            },
          }),
      }),
    ],
  });
async function upload(
  userId: number,
  purpose: "post" | "story" | "chat" | "instant" = "post"
) {
  const id = randomToken();
  await getDb()
    .insert(s.uploads)
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
beforeEach(async () => {
  await resetTestDatabase();
  cookies = {};
  const ids = [];
  for (const name of ["alice", "bob", "carol"]) {
    const id = await resolveAccount({
      provider: "test",
      issuer: "test",
      client: "test",
      subject: name,
      name,
      email: `${name}@example.test`,
    });
    ids.push(id);
    cookies[id] = (await createSession(id, "Extensions test")).split(";")[0];
  }
  [alice, bob, carol] = ids;
  vi.stubEnv("WALLET_OPERATOR_IDS", String(alice));
  await getDb()
    .update(s.users)
    .set({ role: "admin" })
    .where(eq(s.users.id, alice));
  postId = (
    await client(alice).social.createPost.mutate({
      uploadIds: [await upload(alice)],
      caption: "Hello #Lagos #Lagos #Travel",
    })
  ).id;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
afterAll(closeDb);
async function fundUser(userId: number, amount: number) {
  await ledgerTransaction(tx =>
    transfer(tx, {
      reference: `testfund:${userId}`,
      currency: "NGN",
      kind: "test_funding",
      description: "Test fixture only",
      amount,
      from: { key: "test:funding", allowNegative: true },
      to: userAccount(userId, "NGN"),
    })
  );
  await getDb()
    .insert(s.walletVerification)
    .values({
      userId,
      verifiedAt: new Date(),
      verificationReference: `review_${userId}`,
      recipientCode: `RCP_test${userId}`,
    });
}
describe("double-entry wallet and funded rewards", () => {
  it("credits the welcome reward exactly once under 20 concurrent claims", async () => {
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        client(bob).wallet.claim.mutate({ task: "signup" })
      )
    );
    expect(results.filter(r => !r.replayed)).toHaveLength(1);
    expect((await client(bob).wallet.summary.query()).coins).toBe(100);
    const audit = await client(alice).wallet.audit.query();
    expect(audit.mismatches).toEqual([]);
    expect(audit.unbalanced).toEqual([]);
  });
  it("cannot claim incomplete tasks or cash when provider configuration is absent", async () => {
    await expect(
      client(bob).wallet.claim.mutate({ task: "profile" })
    ).rejects.toThrow();
    await expect(
      client(bob).wallet.withdraw.mutate({
        amount: 50000,
        pin: "123456",
        requestKey: crypto.randomUUID(),
      })
    ).rejects.toThrow();
    expect((await client(bob).wallet.summary.query()).cashKobo).toBe(0);
  });
  it("prevents concurrent gift overspending and preserves replay semantics", async () => {
    await client(bob).wallet.claim.mutate({ task: "signup" });
    const key = crypto.randomUUID();
    await client(bob).wallet.gift.mutate({
      creatorId: alice,
      amount: 80,
      requestKey: key,
    });
    expect(
      (
        await client(bob).wallet.gift.mutate({
          creatorId: alice,
          amount: 80,
          requestKey: key,
        })
      ).replayed
    ).toBe(true);
    await expect(
      client(bob).wallet.gift.mutate({
        creatorId: carol,
        amount: 80,
        requestKey: key,
      })
    ).rejects.toThrow();
    const results = await Promise.allSettled([
      client(bob).wallet.gift.mutate({
        creatorId: alice,
        amount: 20,
        requestKey: crypto.randomUUID(),
      }),
      client(bob).wallet.gift.mutate({
        creatorId: carol,
        amount: 20,
        requestKey: crypto.randomUUID(),
      }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((await client(bob).wallet.summary.query()).coins).toBe(0);
    expect((await client(alice).wallet.audit.query()).unbalanced).toEqual([]);
  });
  it("stores salted PIN hashes and requires the old PIN and a fresh session", async () => {
    await client(bob).wallet.setPin.mutate({ pin: "123456" });
    const [v] = await getDb()
      .select()
      .from(s.walletVerification)
      .where(eq(s.walletVerification.userId, bob));
    expect(v.pinHash).not.toContain("123456");
    await expect(
      client(bob).wallet.setPin.mutate({ pin: "654321", currentPin: "111111" })
    ).rejects.toThrow();
    await getDb()
      .update(s.sessions)
      .set({ createdAt: new Date(Date.now() - 600000) })
      .where(eq(s.sessions.userId, bob));
    await expect(
      client(bob).wallet.setPin.mutate({ pin: "654321", currentPin: "123456" })
    ).rejects.toThrow();
  });
  it("reserves withdrawals once and cannot overspend available cash", async () => {
    vi.stubEnv("WALLET_CASH_ENABLED", "true");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_fixture");
    await fundUser(bob, 100000);
    await client(bob).wallet.setPin.mutate({ pin: "123456" });
    const key = crypto.randomUUID();
    const p = await client(bob).wallet.withdraw.mutate({
      amount: 80000,
      pin: "123456",
      requestKey: key,
    });
    expect(
      await client(bob).wallet.withdraw.mutate({
        amount: 80000,
        pin: "123456",
        requestKey: key,
      })
    ).toEqual(p);
    await expect(
      client(bob).wallet.withdraw.mutate({
        amount: 50000,
        pin: "123456",
        requestKey: crypto.randomUUID(),
      })
    ).rejects.toThrow();
    expect((await client(bob).wallet.summary.query()).cashKobo).toBe(20000);
    expect((await client(alice).wallet.audit.query()).mismatches).toEqual([]);
  });
  it("ignores forged webhooks and validates funding remotely before spending", async () => {
    vi.stubEnv("WALLET_CASH_ENABLED", "true");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_fixture");
    const forged = await app.request(
      "http://localhost:3000/api/wallet/paystack",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          event: "charge.success",
          data: { reference: "fake" },
        }),
      }
    );
    expect(forged.status).toBe(401);
    const reference = `tsf_${crypto.randomUUID().replaceAll("-", "")}`;
    await getDb()
      .insert(s.cashFunding)
      .values({ reference, amount: 200000, userId: alice });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: true,
          data: {
            status: "success",
            reference,
            amount: 200000,
            currency: "NGN",
            fees: 100,
          },
        })
      )
    );
    await client(alice).wallet.verifyFunding.mutate({ reference });
    await client(alice).wallet.verifyFunding.mutate({ reference });
    const c = await client(alice).wallet.createCampaign.mutate({
      title: "Verified welcome reward",
      task: "signup",
      amount: 100000,
      budget: 100000,
      expiresAt: new Date(Date.now() + 86400000),
    });
    await getDb().insert(s.walletVerification).values({
      userId: bob,
      verifiedAt: new Date(),
      verificationReference: "verified_unique_bob",
    });
    await client(bob).wallet.claimCash.mutate({ campaignId: c.id });
    expect(
      (await client(bob).wallet.claimCash.mutate({ campaignId: c.id })).replayed
    ).toBe(true);
    expect((await client(bob).wallet.summary.query()).cashKobo).toBe(100000);
    await expect(
      client(alice).wallet.createCampaign.mutate({
        title: "Unfunded budget",
        task: "signup",
        amount: 100000,
        budget: 100000,
        expiresAt: new Date(Date.now() + 86400000),
      })
    ).rejects.toThrow();
  });
  it("only refunds a provider-confirmed failure, once", async () => {
    vi.stubEnv("WALLET_CASH_ENABLED", "true");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_fixture");
    await fundUser(bob, 100000);
    await client(bob).wallet.setPin.mutate({ pin: "123456" });
    const p = await client(bob).wallet.withdraw.mutate({
      amount: 100000,
      pin: "123456",
      requestKey: crypto.randomUUID(),
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          status: true,
          data: {
            status: "failed",
            reference: p.reference,
            amount: 100000,
            currency: "NGN",
            recipient: { recipient_code: `RCP_test${bob}` },
          },
        })
      )
    );
    await client(alice).wallet.reconcile.mutate(p);
    await client(alice).wallet.reconcile.mutate(p);
    expect((await client(bob).wallet.summary.query()).cashKobo).toBe(100000);
    expect((await client(alice).wallet.audit.query()).unbalanced).toEqual([]);
  });
  it("prevents two verified accounts from exceeding a funded campaign budget", async () => {
    vi.stubEnv("WALLET_CASH_ENABLED", "true");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_fixture");
    await ledgerTransaction(tx =>
      transfer(tx, {
        reference: "test_collateral",
        currency: "NGN",
        kind: "test_funding",
        description: "Fixture collateral",
        amount: 100000,
        from: { key: "test:external", allowNegative: true },
        to: { key: "platform:treasury:NGN" },
      })
    );
    const c = await client(alice).wallet.createCampaign.mutate({
      title: "Limited budget",
      task: "signup",
      amount: 100000,
      budget: 100000,
      expiresAt: new Date(Date.now() + 86400000),
    });
    for (const userId of [bob, carol])
      await getDb()
        .insert(s.walletVerification)
        .values({
          userId,
          verifiedAt: new Date(),
          verificationReference: `unique_${userId}`,
        });
    const results = await Promise.allSettled([
      client(bob).wallet.claimCash.mutate({ campaignId: c.id }),
      client(carol).wallet.claimCash.mutate({ campaignId: c.id }),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await client(bob).wallet.summary.query()).cashKobo +
        (await client(carol).wallet.summary.query()).cashKobo
    ).toBe(100000);
    expect((await client(alice).wallet.audit.query()).mismatches).toEqual([]);
  });
  it("holds ambiguous payouts for reconciliation without submitting them twice", async () => {
    vi.stubEnv("WALLET_CASH_ENABLED", "true");
    vi.stubEnv("PAYSTACK_SECRET_KEY", "sk_test_fixture");
    await fundUser(bob, 100000);
    await client(bob).wallet.setPin.mutate({ pin: "123456" });
    await client(bob).wallet.withdraw.mutate({
      amount: 100000,
      pin: "123456",
      requestKey: crypto.randomUUID(),
    });
    const [payout] = await getDb().select().from(s.withdrawals);
    const provider = vi.fn(async () => {
      throw new Error("Timed out after possible provider acceptance");
    });
    vi.stubGlobal("fetch", provider);
    await expect(
      client(alice).wallet.processWithdrawal.mutate({ id: payout.id })
    ).rejects.toThrow();
    await expect(
      client(alice).wallet.processWithdrawal.mutate({ id: payout.id })
    ).rejects.toThrow();
    expect(provider).toHaveBeenCalledTimes(1);
    expect((await client(bob).wallet.summary.query()).cashKobo).toBe(0);
    expect((await getDb().select().from(s.withdrawals))[0].status).toBe(
      "submitted"
    );
  });
  it("denies non-admin operations and retains financial records on user deletion", async () => {
    await client(bob).wallet.claim.mutate({ task: "signup" });
    await expect(client(bob).wallet.audit.query()).rejects.toThrow();
    await expect(
      getDb().delete(s.users).where(eq(s.users.id, bob))
    ).rejects.toThrow();
    vi.stubEnv("WALLET_OPERATOR_IDS", "");
    await expect(client(alice).wallet.audit.query()).rejects.toThrow();
  });
});
describe("social and story access boundaries", () => {
  it("indexes hashtags and reapplies private visibility to search, collections, reposts and map", async () => {
    expect(
      await client(bob).community.search.query({ q: "#lagos" })
    ).toHaveLength(1);
    const c = await client(bob).community.createCollection.mutate({
      name: "Lagos",
    });
    await client(bob).community.collect.mutate({
      collectionId: c.id,
      postId,
      enabled: true,
    });
    await client(bob).community.repost.mutate({ postId, enabled: true });
    await client(alice).community.setLocation.mutate({
      postId,
      latitude: 6.524379,
      longitude: 3.379206,
    });
    expect((await client(bob).community.map.query())[0].latitude).toBe(6.52);
    await client(alice).features.privacy.mutate({ isPrivate: true });
    expect(await client(bob).community.collection.query(c)).toEqual([]);
    expect(await client(bob).community.reposted.query({})).toEqual([]);
    expect(await client(bob).community.search.query({ q: "lagos" })).toEqual(
      []
    );
    expect(await client(bob).community.map.query()).toEqual([]);
    await expect(
      client(carol).community.collect.mutate({
        collectionId: c.id,
        postId,
        enabled: true,
      })
    ).rejects.toThrow();
  });
  it("hides restricted comments from third parties while permitting their author and post owner", async () => {
    await client(alice).community.relationshipUpdate.mutate({
      userId: bob,
      kind: "restrict",
      enabled: true,
    });
    await client(bob).social.addComment.mutate({
      postId,
      text: "Restricted reply",
    });
    expect(await client(carol).social.comments.query({ postId })).toEqual([]);
    const comments = await client(bob).social.comments.query({ postId });
    expect(comments).toHaveLength(1);
    expect(await client(alice).social.comments.query({ postId })).toHaveLength(
      1
    );
    await expect(
      client(carol).community.likeComment.mutate({
        commentId: comments[0].id,
        like: true,
      })
    ).rejects.toThrow();
  });
  it("bounds concurrent upload decoding before reading further bodies", async () => {
    const png = await sharp({
      create: { width: 100, height: 100, channels: 3, background: "#ffcc00" },
    })
      .png()
      .toBuffer();
    let started = 0;
    let notify!: () => void;
    let release!: () => void;
    const ready = new Promise<void>(r => {
      notify = r;
    });
    const hold = new Promise<void>(r => {
      release = r;
    });
    vi.mocked(storage.uploadFile).mockImplementation(async () => {
      started++;
      if (started === 2) notify();
      await hold;
      return { key: `${crypto.randomUUID()}.webp` };
    });
    const request = (userId: number) => {
      const body = new FormData();
      body.set("purpose", "story");
      body.set(
        "file",
        new File([new Uint8Array(png)], "story.png", { type: "image/png" })
      );
      return app.request("http://localhost:3000/api/media/upload", {
        method: "POST",
        headers: { origin: "http://localhost:3000", cookie: cookies[userId] },
        body,
      });
    };
    const running = [request(alice), request(bob)];
    try {
      await ready;
      const third = await request(carol);
      expect(third.status).toBe(503);
    } finally {
      release();
    }
    for (const response of await Promise.all(running))
      expect(response.status).toBe(200);
  });
  it("enforces Close Friends across stories, views, highlights, reactions and notes", async () => {
    await client(alice).community.relationshipUpdate.mutate({
      userId: bob,
      kind: "close_friend",
      enabled: true,
    });
    await client(alice).social.addStory.mutate({
      uploadId: await upload(alice, "story"),
      closeFriends: true,
    });
    const [story] = await getDb().select().from(s.stories);
    await client(alice).features.createHighlight.mutate({
      title: "Private",
      storyIds: [story.id],
    });
    expect(await client(carol).social.stories.query()).toEqual([]);
    expect(
      await client(carol).features.highlights.query({ userId: alice })
    ).toEqual([]);
    await expect(
      client(carol).features.viewStory.mutate({ storyId: story.id })
    ).rejects.toThrow();
    await expect(
      client(carol).community.storyReaction.mutate({
        storyId: story.id,
        reaction: "❤️",
      })
    ).rejects.toThrow();
    await client(bob).community.storyReaction.mutate({
      storyId: story.id,
      reaction: "❤️",
      reply: "Hello",
    });
    expect(
      await client(alice).community.storyReplies.query({ storyId: story.id })
    ).toHaveLength(1);
    await client(alice).community.note.mutate({
      text: "Private note",
      closeFriends: true,
    });
    expect(await client(bob).community.notes.query()).toHaveLength(1);
    expect(await client(carol).community.notes.query()).toHaveLength(0);
  });
  it("allows only the addressed recipient to open an Instant exactly once under a race", async () => {
    await client(alice).community.relationshipUpdate.mutate({
      userId: bob,
      kind: "close_friend",
      enabled: true,
    });
    const instant = await client(alice).community.sendInstant.mutate({
      uploadId: await upload(alice, "instant"),
      recipients: [bob],
    });
    await expect(
      client(carol).community.openInstant.mutate(instant)
    ).rejects.toThrow();
    const results = await Promise.allSettled([
      client(bob).community.openInstant.mutate(instant),
      client(bob).community.openInstant.mutate(instant),
    ]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(vi.mocked(storage.readFile)).toHaveBeenCalled();
  });
});
describe("group and broadcast security", () => {
  it("keeps database defaults and application dates in UTC on every pooled connection", async () => {
    // Running against a non-UTC database server catches a driver-only timezone fix.
    await closeDb();
    await Promise.all(
      Array.from({ length: 10 }, () =>
        getDb().transaction(async tx => {
          const [rows] = await tx.execute(
            sql`SELECT @@session.time_zone AS zone`
          );
          expect((rows as unknown as { zone: string }[])[0].zone).toBe(
            "+00:00"
          );
          const before = Date.now();
          const [thread] = await tx.insert(s.chatThreads).values({
            ownerId: alice,
            title: "Clock regression",
            kind: "group",
          });
          const [message] = await tx.insert(s.chatMessages).values({
            threadId: thread.insertId,
            senderId: alice,
            text: "Default timestamps",
          });
          const [stored] = await tx
            .select()
            .from(s.chatMessages)
            .where(eq(s.chatMessages.id, message.insertId));
          expect(stored.deliverAt.getTime()).toBeGreaterThanOrEqual(
            before - 1000
          );
          expect(stored.deliverAt.getTime()).toBeLessThanOrEqual(Date.now());
          expect(stored.createdAt.getTime()).toBe(stored.deliverAt.getTime());
        })
      )
    );
  });
  it("paginates without duplicates and retrieves old pins without bypassing membership", async () => {
    const t = await client(alice).chat.create.mutate({ title: "Long history" });
    await client(bob).chat.join.mutate(
      await client(alice).chat.invite.mutate({ threadId: t.id })
    );
    await getDb()
      .insert(s.chatMessages)
      .values(
        Array.from({ length: 125 }, (_, i) => ({
          threadId: t.id,
          senderId: alice,
          text: `History ${i}`,
          pinned: i === 0,
        }))
      );
    const first = await client(bob).chat.messages.query({ threadId: t.id });
    const second = await client(bob).chat.messages.query({
      threadId: t.id,
      before: first[0].id,
    });
    const third = await client(bob).chat.messages.query({
      threadId: t.id,
      before: second[0].id,
    });
    expect([first.length, second.length, third.length]).toEqual([50, 50, 25]);
    expect(new Set([...first, ...second, ...third].map(m => m.id)).size).toBe(
      125
    );
    expect(third[0].text).toBe("History 0");
    const pins = await client(bob).chat.messages.query({
      threadId: t.id,
      pinnedOnly: true,
    });
    expect(pins.map(m => m.text)).toEqual(["History 0"]);
    await expect(
      client(carol).chat.messages.query({ threadId: t.id, pinnedOnly: true })
    ).rejects.toThrow();
    await client(bob).chat.leave.mutate({ threadId: t.id });
    await expect(
      client(bob).chat.messages.query({ threadId: t.id, pinnedOnly: true })
    ).rejects.toThrow();
    await client(bob).chat.join.mutate(
      await client(alice).chat.invite.mutate({ threadId: t.id })
    );
    expect(
      await client(bob).chat.messages.query({
        threadId: t.id,
        pinnedOnly: true,
      })
    ).toEqual([]);
  });
  it("records only displayed receipts and rejects hidden or cross-thread IDs atomically", async () => {
    const t = await client(alice).chat.create.mutate({
      title: "Exact receipts",
    });
    const prior = await client(alice).chat.send.mutate({
      threadId: t.id,
      text: "Pre-join",
    });
    await client(bob).chat.join.mutate(
      await client(alice).chat.invite.mutate({ threadId: t.id })
    );
    const visible = await client(alice).chat.send.mutate({
      threadId: t.id,
      text: "Visible pin",
    });
    const unseen = await client(alice).chat.send.mutate({
      threadId: t.id,
      text: "Unseen",
    });
    const future = await client(alice).chat.send.mutate({
      threadId: t.id,
      text: "Future",
      deliverAt: new Date(Date.now() + 60000),
    });
    const other = await client(alice).chat.create.mutate({ title: "Other" });
    const foreign = await client(alice).chat.send.mutate({
      threadId: other.id,
      text: "Foreign",
    });
    for (const hidden of [prior.id, future.id, foreign.id]) {
      await expect(
        client(bob).chat.readDisplayed.mutate({
          threadId: t.id,
          messageIds: [visible.id, hidden],
        })
      ).rejects.toThrow();
    }
    expect(await getDb().select().from(s.chatReceipts)).toEqual([]);
    await client(bob).chat.readDisplayed.mutate({
      threadId: t.id,
      messageIds: [visible.id, visible.id],
    });
    await client(bob).chat.readDisplayed.mutate({
      threadId: t.id,
      messageIds: [visible.id],
    });
    const rows = await client(alice).chat.messages.query({ threadId: t.id });
    expect(rows.find(m => m.id === visible.id)?.readBy).toBe(1);
    expect(rows.find(m => m.id === unseen.id)?.readBy).toBe(0);
    expect(rows.find(m => m.id === future.id)?.readBy).toBe(0);
    await client(bob).features.block.mutate({ userId: alice, block: true });
    await expect(
      client(bob).chat.readDisplayed.mutate({
        threadId: t.id,
        messageIds: [visible.id],
      })
    ).rejects.toThrow();
  });
  it("changes and removes reactions while protecting blocked and deleted pins", async () => {
    const t = await client(alice).chat.create.mutate({
      title: "Reaction privacy",
    });
    for (const who of [bob, carol])
      await client(who).chat.join.mutate(
        await client(alice).chat.invite.mutate({ threadId: t.id })
      );
    const m = await client(bob).chat.send.mutate({
      threadId: t.id,
      text: "React here",
    });
    await client(bob).chat.update.mutate({ id: m.id, action: "pin" });
    await client(carol).chat.react.mutate({ id: m.id, reaction: "🔥" });
    await client(carol).chat.react.mutate({ id: m.id, reaction: "😂" });
    let rows = await client(carol).chat.messages.query({
      threadId: t.id,
      pinnedOnly: true,
    });
    expect(rows[0].myReaction).toBe("😂");
    expect(rows[0].reactions).toHaveLength(1);
    await client(carol).chat.react.mutate({
      id: m.id,
      reaction: "😂",
      remove: true,
    });
    rows = await client(carol).chat.messages.query({
      threadId: t.id,
      pinnedOnly: true,
    });
    expect(rows[0].myReaction).toBeNull();
    expect(rows[0].reactions).toHaveLength(0);
    await client(carol).features.block.mutate({ userId: bob, block: true });
    expect(
      await client(carol).chat.messages.query({
        threadId: t.id,
        pinnedOnly: true,
      })
    ).toEqual([]);
    await expect(
      client(carol).chat.react.mutate({ id: m.id, reaction: "❤️" })
    ).rejects.toThrow();
    await client(bob).chat.update.mutate({ id: m.id, action: "delete" });
    expect(
      await client(alice).chat.messages.query({
        threadId: t.id,
        pinnedOnly: true,
      })
    ).toEqual([]);
  });
  it("requires acceptance, hides pre-join history and validates reply transport", async () => {
    await client(bob).social.follow.mutate({ userId: alice, follow: true });
    const t = await client(alice).chat.create.mutate({
      title: "Friends",
      users: [bob],
    });
    const old = await client(alice).chat.send.mutate({
      threadId: t.id,
      text: "Before acceptance",
    });
    await expect(
      client(bob).chat.messages.query({ threadId: t.id })
    ).rejects.toThrow();
    await client(bob).chat.accept.mutate({ threadId: t.id });
    expect(await client(bob).chat.messages.query({ threadId: t.id })).toEqual(
      []
    );
    await expect(
      client(bob).chat.send.mutate({
        threadId: t.id,
        text: "Guessing old content",
        replyId: old.id,
      })
    ).rejects.toThrow();
    const message = await client(alice).chat.send.mutate({
      threadId: t.id,
      text: "Hello",
    });
    await client(bob).chat.send.mutate({
      threadId: t.id,
      text: "Reply",
      replyId: message.id,
    });
    expect(
      await client(bob).chat.messages.query({ threadId: t.id })
    ).toHaveLength(2);
    await expect(
      client(carol).chat.messages.query({ threadId: t.id })
    ).rejects.toThrow();
  });
  it("enforces three pins under concurrency and sender-only edit/delete", async () => {
    const t = await client(alice).chat.create.mutate({ title: "Pins" });
    const code = await client(alice).chat.invite.mutate({ threadId: t.id });
    await client(bob).chat.join.mutate(code);
    const messages = [];
    for (let i = 0; i < 4; i++)
      messages.push(
        await client(alice).chat.send.mutate({
          threadId: t.id,
          text: `Message ${i}`,
        })
      );
    const results = await Promise.allSettled(
      messages.map(m =>
        client(bob).chat.update.mutate({ id: m.id, action: "pin" })
      )
    );
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(3);
    await expect(
      client(bob).chat.update.mutate({
        id: messages[0].id,
        action: "edit",
        text: "Edited by another user",
      })
    ).rejects.toThrow();
    await expect(
      client(bob).chat.update.mutate({ id: messages[0].id, action: "delete" })
    ).rejects.toThrow();
  });
  it("keeps scheduled messages private until delivery and prevents cross-thread replies", async () => {
    const t = await client(alice).chat.create.mutate({ title: "Schedule" });
    await client(bob).chat.join.mutate(
      await client(alice).chat.invite.mutate({ threadId: t.id })
    );
    const message = await client(alice).chat.send.mutate({
      threadId: t.id,
      text: "Future",
      deliverAt: new Date(Date.now() + 3600000),
    });
    expect(await client(bob).chat.messages.query({ threadId: t.id })).toEqual(
      []
    );
    await expect(
      client(bob).chat.react.mutate({ id: message.id, reaction: "❤️" })
    ).rejects.toThrow();
    const other = await client(alice).chat.create.mutate({ title: "Other" });
    await expect(
      client(alice).chat.send.mutate({
        threadId: other.id,
        text: "Cross thread",
        replyId: message.id,
      })
    ).rejects.toThrow();
    await client(alice).chat.update.mutate({
      id: message.id,
      action: "delete",
    });
    expect(await client(alice).chat.messages.query({ threadId: t.id })).toEqual(
      []
    );
  });
  it("rejects reused attachments and broadcast publication by subscribers", async () => {
    const t = await client(alice).chat.create.mutate({
      title: "Channel",
      kind: "broadcast",
    });
    const invite = await client(alice).chat.invite.mutate({ threadId: t.id });
    await client(bob).chat.join.mutate(invite);
    await expect(
      client(bob).chat.send.mutate({ threadId: t.id, text: "Not owner" })
    ).rejects.toThrow();
    const uploadId = await upload(alice, "chat");
    await client(alice).chat.send.mutate({ threadId: t.id, uploadId });
    await expect(
      client(alice).chat.send.mutate({ threadId: t.id, uploadId })
    ).rejects.toThrow();
    await client(alice).chat.invite.mutate({ threadId: t.id });
    await expect(client(carol).chat.join.mutate(invite)).rejects.toThrow();
  });
  it("does not mark a future message read merely because a newer ID was seen", async () => {
    const t = await client(alice).chat.create.mutate({ title: "Receipts" });
    await client(bob).chat.join.mutate(
      await client(alice).chat.invite.mutate({ threadId: t.id })
    );
    const future = await client(alice).chat.send.mutate({
      threadId: t.id,
      text: "Future older ID",
      deliverAt: new Date(Date.now() + 3600000),
    });
    const now = await client(alice).chat.send.mutate({
      threadId: t.id,
      text: "Visible newer ID",
    });
    await client(bob).chat.read.mutate({ threadId: t.id, messageId: now.id });
    let rows = await client(alice).chat.messages.query({ threadId: t.id });
    expect(rows.find(m => m.id === future.id)?.readBy).toBe(0);
    expect(rows.find(m => m.id === now.id)?.readBy).toBe(1);
    await getDb()
      .update(s.chatMessages)
      .set({ deliverAt: new Date(Date.now() - 1000) })
      .where(eq(s.chatMessages.id, future.id));
    await client(bob).chat.read.mutate({ threadId: t.id, messageId: now.id });
    rows = await client(alice).chat.messages.query({ threadId: t.id });
    expect(rows.find(m => m.id === future.id)?.readBy).toBe(1);
  });
  it("respects message-request preferences and blocked owners", async () => {
    await client(bob).community.setPreferences.mutate({
      theme: "system",
      language: "en",
      requests: "nobody",
    });
    await expect(
      client(alice).chat.create.mutate({ title: "Unwanted", users: [bob] })
    ).rejects.toThrow();
    const t = await client(alice).chat.create.mutate({ title: "Invite" });
    const code = await client(alice).chat.invite.mutate({ threadId: t.id });
    await client(bob).features.block.mutate({ userId: alice, block: true });
    await expect(client(bob).chat.join.mutate(code)).rejects.toThrow();
  });
});
describe("bounded local read-load diagnostic", () => {
  it("handles thirty concurrent authenticated reads over 1000 posts", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({
      userId: alice,
      imageKey: `load${i}.webp`,
      caption: `Load fixture ${i}`,
    }));
    await getDb().insert(s.posts).values(rows);
    const samples = await Promise.all(
      Array.from({ length: 30 }, async () => {
        const start = performance.now();
        const feed = await client(bob).social.feed.query({ limit: 30 });
        expect(feed).toHaveLength(30);
        return performance.now() - start;
      })
    );
    samples.sort((a, b) => a - b);
    await mkdir("qa-results", { recursive: true });
    await writeFile(
      "qa-results/read-load.json",
      JSON.stringify({
        concurrency: 30,
        fixturePosts: 1000,
        p50Ms: Math.round(samples[14]),
        p95Ms: Math.round(samples[28]),
        maxMs: Math.round(samples[29]),
      })
    );
    console.info(
      JSON.stringify({
        diagnostic: "local_read_load",
        concurrency: 30,
        fixturePosts: 1000,
        p50Ms: Math.round(samples[14]),
        p95Ms: Math.round(samples[28]),
        maxMs: Math.round(samples[29]),
      })
    );
    expect(samples.every(Number.isFinite)).toBe(true);
  });
});
