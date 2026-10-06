import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
let client: S3Client | undefined;
function config() {
  const bucket = process.env.S3_BUCKET;
  if (!bucket) throw new Error("S3_BUCKET is not configured");
  client ??= new S3Client({
    region: process.env.S3_REGION || "auto",
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials:
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
        ? {
            accessKeyId: process.env.S3_ACCESS_KEY_ID,
            secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
          }
        : undefined,
  });
  return { client, bucket };
}
const cache = new Map<string, { url: string; expires: number }>();
export const storage = {
  async uploadFile(input: {
    fileContent: Uint8Array;
    fileName: string;
    contentType: string;
  }) {
    const { client, bucket } = config();
    const key = `${input.fileName.replace(/\.[^.]+$/, "")}-${randomUUID()}.${input.fileName.split(".").at(-1)}`;
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: input.fileContent,
        ContentType: input.contentType,
        CacheControl: "private, max-age=60",
      })
    );
    return { key };
  },
  async getPresignedUrls({ keys }: { keys: string[] }) {
    if (!keys.length) return { urls: [] as string[] };
    const { client, bucket } = config();
    const urls = await Promise.all(
      keys.map(async key => {
        const hit = cache.get(key);
        if (hit && hit.expires > Date.now()) return hit.url;
        const url = await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: bucket, Key: key }),
          { expiresIn: 120 }
        );
        if (cache.size >= 1000) cache.delete(cache.keys().next().value!);
        cache.set(key, { url, expires: Date.now() + 60000 });
        return url;
      })
    );
    return { urls };
  },
  async readFile(key: string) {
    const { client, bucket } = config();
    const result = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );
    if (!result.Body || (result.ContentLength ?? 0) > 20 * 1024 * 1024)
      throw new Error("Invalid private media");
    return Buffer.from(await result.Body.transformToByteArray());
  },
  async deleteFile({ fileKey }: { fileKey: string }) {
    const { client, bucket } = config();
    await client.send(
      new DeleteObjectCommand({ Bucket: bucket, Key: fileKey })
    );
    cache.delete(fileKey);
  },
};
