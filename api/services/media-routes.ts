import { Hono } from "hono";
import { authenticate } from "../auth/sessions";
import { allowRequest } from "../auth/rate-limit";
import { getDb } from "../queries/connection";
import { uploads } from "../../db/schema";
import { randomToken } from "../auth/security";
import { processMedia } from "./process-media";
import { storage } from "./storage";
const router = new Hono();
router.post("/upload", async c => {
  const auth = await authenticate(c.req.raw.headers);
  if (!auth) return c.json({ error: "Sign in first" }, 401);
  if (!(await allowRequest(`upload:${auth.user.id}`, 20, 3600)))
    return c.json({ error: "Upload limit reached. Try again later." }, 429);
  let data: FormData;
  try {
    data = await c.req.formData();
  } catch {
    return c.json({ error: "Send a multipart media upload" }, 400);
  }
  const file = data.get("file"),
    purpose = data.get("purpose");
  if (
    !(file instanceof File) ||
    !["post", "avatar", "story"].includes(String(purpose)) ||
    !file.size ||
    file.size > 20 * 1024 * 1024
  )
    return c.json({ error: "Choose a file up to 20 MB" }, 400);
  let media;
  try {
    media = await processMedia(
      Buffer.from(await file.arrayBuffer()),
      file.type,
      purpose === "post"
    );
  } catch {
    return c.json(
      {
        error:
          "Invalid media. Use JPEG, PNG, WebP, or a video under 60 seconds and 20 MB.",
      },
      400
    );
  }
  const saved = await storage.uploadFile({
    fileContent: media.bytes,
    fileName: `${purpose}/u${auth.user.id}.${media.extension}`,
    contentType: media.type,
  });
  const id = randomToken();
  try {
    await getDb()
      .insert(uploads)
      .values({
        id,
        userId: auth.user.id,
        key: saved.key,
        purpose: purpose as "post" | "avatar" | "story",
        contentType: media.type,
        expiresAt: new Date(Date.now() + 3600000),
      });
  } catch (error) {
    await storage.deleteFile({ fileKey: saved.key }).catch(() => {});
    throw error;
  }
  return c.json({ uploadId: id, contentType: media.type });
});
export default router;
