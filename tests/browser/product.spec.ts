import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import fs from "node:fs";
async function signIn(context: BrowserContext, person = "alice") {
  const accounts = JSON.parse(
    fs.readFileSync("test-results/accounts.json", "utf8")
  );
  const [name, value] = accounts[person].cookie.split("=");
  await context.addCookies([
    {
      name,
      value,
      url: "http://localhost:3000",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
  return accounts[person].id as number;
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
}
test("anonymous access redirects and unconfigured login stays usable", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Your people. Your moments." })
  ).toBeVisible();
  await noOverflow(page);
});
test("configured login controls fit narrow screens and show phone errors", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.route("**/api/auth/providers", route =>
    route.fulfill({
      json: { providers: ["google", "facebook", "chatgpt"], phone: true },
    })
  );
  await page.route("**/api/auth/phone/send", route =>
    route.fulfill({ status: 400, json: { error: "Use international format" } })
  );
  await page.goto("/login");
  for (const provider of ["Google", "Facebook", "ChatGPT"])
    await expect(
      page.getByRole("button", { name: `Continue with ${provider}` })
    ).toBeVisible();
  await page.getByLabel("Phone number", { exact: true }).fill("0801234");
  await page.getByRole("button", { name: "Send verification code" }).click();
  await expect(page.getByRole("alert")).toHaveText("Use international format");
  await noOverflow(page);
});
for (const width of [320, 375, 768, 1024, 1440])
  test(`authenticated routes fit ${width}px and expose no uncaught errors`, async ({
    page,
    context,
  }) => {
    await signIn(context);
    await page.setViewportSize({ width, height: 900 });
    const errors: string[] = [];
    page.on("pageerror", e => errors.push(e.message));
    for (const path of [
      "/",
      "/alice",
      "/settings",
      "/explore",
      "/saved",
      "/messages",
      "/notifications",
      "/library",
      "/wallet",
      "/groups",
      "/social",
      "/map",
      "/studio",
    ]) {
      await page.goto(path);
      await expect(
        page.getByRole("navigation", {
          name: width < 768 ? "Mobile navigation" : "Main navigation",
        })
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      await noOverflow(page);
    }
    expect(errors).toEqual([]);
    if (width === 375) {
      await page.goto("/alice");
      await expect(
        page.getByRole("heading", { name: "alice", exact: true })
      ).toBeVisible();
      await expect(
        page.getByRole("button", { name: /Open post by/ }).first()
      ).toBeVisible();
      await page.screenshot({
        path: "test-results/profile-mobile.png",
        fullPage: true,
      });
    }
    if (width === 1440) {
      await page.goto("/");
      await expect(page.locator("article").first()).toBeVisible();
      await page.screenshot({
        path: "test-results/feed-desktop.png",
        fullPage: true,
      });
    }
  });
test("create dialog handles focus, Escape and a real two-photo upload", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Create post", exact: true })
    .filter({ visible: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await noOverflow(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Create post", exact: true })
    .filter({ visible: true })
    .click();
  await page
    .getByLabel("Post media")
    .setInputFiles(["test-results/upload.png", "test-results/upload.png"]);
  await page
    .getByLabel("Caption", { exact: true })
    .fill("Browser-created carousel");
  await page.getByRole("button", { name: "Share post", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 20000 });
  await expect(
    page.getByText("Browser-created carousel", { exact: false }).first()
  ).toBeVisible();
  await page.getByRole("button", { name: "Next media" }).first().click();
  await expect(page.getByText("2/2", { exact: true }).first()).toBeVisible();
});
test("likes, comments and saves persist through reload", async ({
  page,
  context,
}) => {
  await signIn(context, "bob");
  await page.goto("/");
  const post = page.locator("article").first();
  await post.getByRole("button", { name: "Like", exact: true }).click();
  await expect(post.getByRole("button", { name: "Unlike" })).toBeVisible();
  await post
    .getByLabel("Comment", { exact: true })
    .fill("A browser-tested comment");
  await post.getByRole("button", { name: "Post", exact: true }).click();
  await expect(post.getByLabel("Comment", { exact: true })).toHaveValue("");
  await post.getByRole("button", { name: "Save", exact: true }).click();
  await expect(post.getByRole("button", { name: "Unsave" })).toBeVisible();
  await page.reload();
  await expect(
    page.locator("article").first().getByRole("button", { name: "Unlike" })
  ).toBeVisible();
  await page.goto("/saved");
  await expect(
    page.getByRole("button", { name: /Open post by/ }).first()
  ).toBeVisible();
});
test("private account hides posts until an accepted follow request", async ({
  page,
  context,
  browser,
}) => {
  await signIn(context, "alice");
  await page.goto("/settings");
  await page.getByRole("checkbox").check();
  await expect(page.getByRole("checkbox")).toBeEnabled();
  const bobContext = await browser.newContext();
  await signIn(bobContext, "bob");
  const bobPage = await bobContext.newPage();
  await bobPage.goto("http://localhost:3000/alice");
  await expect(
    bobPage.getByText("This account is private. Follow to request access.")
  ).toBeVisible();
  await bobPage.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(
    bobPage.getByRole("button", { name: "Requested" })
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Accept", exact: true }).click();
  await bobPage.reload();
  await expect(
    bobPage.getByRole("button", { name: /Open post by/ }).first()
  ).toBeVisible();
  await page.getByRole("checkbox").uncheck();
  await expect(page.getByRole("checkbox")).toBeEnabled();
  await bobContext.close();
});
test("a failed feed request presents a usable retry and recovers", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.route("**/api/trpc/**", route =>
    route.request().url().includes("social.feed")
      ? route.abort("failed")
      : route.continue()
  );
  await page.goto("/");
  await expect(page.getByText("Your feed could not be loaded.")).toBeVisible();
  await page.unroute("**/api/trpc/**");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator("article").first()).toBeVisible();
});
test("Story uploads, Highlights and archive controls work at 320px", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  await page
    .getByLabel("Story image", { exact: true })
    .setInputFiles("test-results/upload.png");
  await page
    .getByRole("button", { name: "View alice stories", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await noOverflow(page);
  await page.keyboard.press("Escape");
  await page.goto("/library");
  await page
    .getByRole("button", { name: /Select story/ })
    .first()
    .click();
  await page.getByLabel("Highlight title").fill("H".repeat(40));
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Remove highlight" })
  ).toBeVisible();
  await noOverflow(page);
  await page.goto("/alice");
  await expect(
    page.getByRole("button", { name: "H".repeat(40) })
  ).toBeVisible();
  await noOverflow(page);
  await page.getByRole("button", { name: "H".repeat(40) }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await noOverflow(page);
  await page.keyboard.press("Escape");
  await page.goto("/library");
  await page.getByRole("button", { name: "Remove highlight" }).click();
  await expect(
    page.getByRole("button", { name: "Remove highlight" })
  ).toHaveCount(0);
});
test("post archive, deletion and restore round trip through the UI", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.goto("/");
  await page
    .locator("article")
    .first()
    .getByRole("button", { name: "Post options" })
    .click();
  await page.getByRole("button", { name: "Archive post", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/library");
  await page
    .getByRole("button", { name: "Show on profile", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Show on profile", exact: true })
  ).toHaveCount(0);
  await page.goto("/");
  await page
    .locator("article")
    .first()
    .getByRole("button", { name: "Post options" })
    .click();
  await page.getByRole("button", { name: "Move to Recently Deleted" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/library");
  await page
    .getByRole("button", { name: "Recently deleted", exact: true })
    .click();
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Restore", exact: true })
  ).toHaveCount(0);
  await page.goto("/");
  await expect(
    page.getByText("Browser-created carousel", { exact: false }).first()
  ).toBeVisible();
});
test("wallet welcome reward survives reload and cannot be claimed twice", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/wallet");
  const reward = page
    .getByText("Welcome to T Social")
    .locator("..")
    .locator("..");
  await reward.getByRole("button", { name: "Claim", exact: true }).click();
  await expect(reward.getByRole("button", { name: "Claimed" })).toBeDisabled();
  await page.reload();
  await expect(page.getByText("100", { exact: true })).toBeVisible();
  await expect(
    page.getByText("No cash signup bonus is promised.", { exact: false })
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: "test-results/wallet-mobile.png",
    fullPage: true,
  });
});
test("collections, Notes, group invites, replies and edits work at 320px", async ({
  page,
  context,
  browser,
}) => {
  await signIn(context);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/saved");
  await page
    .getByLabel("Collection name")
    .fill("Places I love " + "long".repeat(8));
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Places I love/ })
  ).toBeVisible();
  await noOverflow(page);
  await page.goto("/social");
  await page
    .getByLabel("Note", { exact: true })
    .fill("A real note for friends");
  await page.getByLabel("Close Friends only", { exact: true }).check();
  await page.getByRole("button", { name: "Share", exact: true }).click();
  await expect(
    page.getByText("A real note for friends", { exact: true })
  ).toBeVisible();
  await page.goto("/groups");
  await page
    .getByLabel("Group name")
    .fill("Timzee friends " + "long".repeat(12));
  await page.getByRole("button", { name: "Create", exact: true }).click();
  await page.getByLabel("Group message").fill("Before you joined");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await page.getByRole("button", { name: "Create invite" }).click();
  const invite = await page.getByLabel("Invite link").inputValue();
  const bobContext = await browser.newContext({
    viewport: { width: 320, height: 900 },
  });
  await signIn(bobContext, "bob");
  const bob = await bobContext.newPage();
  await bob.goto(invite);
  await bob.getByRole("button", { name: "Join", exact: true }).click();
  await expect(bob.getByLabel("Group message")).toBeVisible();
  await expect(bob.getByText("Before you joined", { exact: true })).toHaveCount(
    0
  );
  await page.getByLabel("Group message").fill("Welcome, friend");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(bob.getByText("Welcome, friend", { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await bob.getByRole("button", { name: "Reply", exact: true }).click();
  await bob.getByLabel("Group message").fill("My group reply");
  await bob.getByRole("button", { name: "Send", exact: true }).click();
  await expect(bob.getByText("My group reply", { exact: true })).toBeVisible();
  await bob.getByRole("button", { name: "Edit", exact: true }).click();
  await bob.getByLabel("Edit message").fill("My edited reply");
  await bob.getByRole("button", { name: "Save", exact: true }).click();
  await expect(bob.getByText("My edited reply", { exact: true })).toBeVisible();
  await noOverflow(page);
  await noOverflow(bob);
  await bob.screenshot({
    path: "test-results/group-mobile.png",
    fullPage: true,
  });
  await bobContext.close();
});
test("history pages, old pins and reaction replacement work on a narrow screen", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/groups");
  await page
    .getByRole("button", { name: "History fixture group", exact: true })
    .click();
  await expect(page.locator("article")).toHaveCount(50);
  await expect(
    page.getByText("History message 75", { exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Older messages", exact: true })
    .click();
  await expect(
    page.getByText("History message 25", { exact: true })
  ).toBeVisible();
  await expect(page.locator("article")).toHaveCount(50);
  await page
    .getByRole("button", { name: "Older messages", exact: true })
    .click();
  await expect(page.locator("article")).toHaveCount(25);
  await expect(
    page.getByRole("button", { name: "Older messages", exact: true })
  ).toBeDisabled();
  await noOverflow(page);
  await page
    .getByRole("button", { name: "Latest messages", exact: true })
    .click();
  await expect(
    page.getByText("History message 75", { exact: true })
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Pinned messages", exact: true })
    .click();
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.getByText(/^Old pinned message /)).toBeVisible();
  await page
    .getByRole("button", { name: "React to message", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Fire reaction", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Fire reaction, 1", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Laugh reaction", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Laugh reaction, 1", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("button", { name: "Fire reaction", exact: true })
  ).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("button", { name: "Laugh reaction, 1", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Laugh reaction", exact: true })
  ).toHaveAttribute("aria-pressed", "false");
  await noOverflow(page);
  await page.screenshot({
    path: "test-results/history-pins-mobile.png",
    fullPage: true,
  });
});
test("switching conversations clears schedules, edits and destructive confirmation", async ({
  page,
  context,
}) => {
  await signIn(context);
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto("/groups");
  await page
    .getByRole("button", { name: "History fixture group", exact: true })
    .click();
  await page.getByLabel("Group message").fill("Private draft");
  await page.getByLabel("Schedule message").fill("2026-10-20T12:00");
  await page
    .getByRole("button", { name: "Delete channel", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.getByLabel("Edit message").fill("Edit draft");
  await page
    .getByRole("button", { name: "Second conversation group", exact: true })
    .click();
  await expect(page.getByLabel("Group message")).toHaveValue("");
  await expect(page.getByLabel("Schedule message")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Confirm delete channel", exact: true })
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "History fixture group", exact: true })
    .click();
  await expect(page.getByLabel("Edit message")).toHaveCount(0);
  await noOverflow(page);
});
test("broadcast readers see reactions without a misleading send form", async ({
  page,
  context,
}) => {
  await signIn(context, "bob");
  await page.goto("/groups");
  await page
    .getByRole("button", { name: "Broadcast fixture broadcast", exact: true })
    .click();
  await expect(
    page.getByText("An owner announcement", { exact: true })
  ).toBeVisible();
  await expect(page.getByLabel("Group message")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Pin", exact: true })
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "React to message", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Applause reaction", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Applause reaction, 1", exact: true })
  ).toHaveAttribute("aria-pressed", "true");
});
test("messaging, read state and logout work through the UI", async ({
  page,
  context,
  browser,
}) => {
  const bob = await signIn(context, "bob");
  await page.goto("/alice");
  const follow = page.getByRole("button", { name: "Follow", exact: true });
  if (await follow.count()) await follow.click();
  await expect(
    page.getByRole("button", { name: "Following", exact: true })
  ).toBeVisible();
  await context.clearCookies();
  const alice = await signIn(context, "alice");
  await page.goto(`/messages?user=${bob}`);
  await page
    .getByLabel("Message", { exact: true })
    .fill("A real direct message");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    page.locator("section").getByText("A real direct message", { exact: true })
  ).toBeVisible();
  const recipientContext = await browser.newContext();
  await signIn(recipientContext, "bob");
  const recipient = await recipientContext.newPage();
  await recipient.goto(`http://localhost:3000/messages?user=${alice}`);
  await expect(
    recipient
      .locator("section")
      .getByText("A real direct message", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("Read", { exact: true })).toBeVisible({
    timeout: 10000,
  });
  await page.getByRole("button", { name: "Unsend message" }).click();
  await expect(
    recipient
      .locator("section")
      .getByText("A real direct message", { exact: true })
  ).toHaveCount(0, { timeout: 10000 });
  await recipientContext.close();
  await page
    .getByRole("button", { name: "More options" })
    .filter({ visible: true })
    .click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/login$/);
});
