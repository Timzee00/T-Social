import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "../db/schema";
import { authenticate } from "./auth/sessions";
export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user?: User;
  session?: { id: number; createdAt: Date };
};
export async function createContext(
  opts: FetchCreateContextFnOptions
): Promise<TrpcContext> {
  const auth = await authenticate(opts.req.headers);
  return {
    req: opts.req,
    resHeaders: opts.resHeaders,
    user: auth?.user,
    session: auth?.session,
  };
}
