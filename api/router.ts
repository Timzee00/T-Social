import { chatRouter } from "./chat-router";
import { communityRouter } from "./community-router";
import { walletRouter } from "./wallet/router";
import { featuresRouter } from "./features-router";
import { authRouter } from "./auth-router";
import { socialRouter } from "./social-router";
import { createRouter, publicQuery } from "./middleware";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  social: socialRouter,
  features: featuresRouter,
  wallet: walletRouter,
  community: communityRouter,
  chat: chatRouter,
});

export type AppRouter = typeof appRouter;
