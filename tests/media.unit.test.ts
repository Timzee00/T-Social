import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { processMedia } from "../api/services/process-media";
describe("media processing", () => {
  it("strips metadata and normalizes real images to bounded WebP", async () => {
    const image = await sharp({
      create: { width: 2200, height: 30, channels: 3, background: "#2196f3" },
    })
      .jpeg()
      .withMetadata()
      .toBuffer();
    const result = await processMedia(image, "image/jpeg", false);
    const metadata = await sharp(result.bytes).metadata();
    expect(result.type).toBe("image/webp");
    expect(metadata.width).toBeLessThanOrEqual(2048);
    expect(metadata.exif).toBeUndefined();
  });
  it("rejects SVG, forged MIME, empty media and oversized uploads", async () => {
    await expect(
      processMedia(
        Buffer.from('<svg onload="alert(1)"/>'),
        "image/svg+xml",
        false
      )
    ).rejects.toThrow();
    await expect(
      processMedia(Buffer.from("fake png"), "image/png", false)
    ).rejects.toThrow();
    const png = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "white" },
    })
      .png()
      .toBuffer();
    await expect(processMedia(png, "image/jpeg", false)).rejects.toThrow();
    await expect(
      processMedia(Buffer.alloc(15 * 1024 * 1024 + 1), "image/jpeg", false)
    ).rejects.toThrow();
  });
  it("does not accept video for avatars or Stories, or a fake MP4", async () => {
    await expect(
      processMedia(Buffer.from("not a video"), "video/mp4", false)
    ).rejects.toThrow();
    await expect(
      processMedia(Buffer.from("not a video"), "video/mp4", true)
    ).rejects.toThrow();
  });
  it("transcodes a real short video and rejects it for image-only purposes", async () => {
    const folder = await mkdtemp(path.join(tmpdir(), "t-video-test-"));
    try {
      const file = path.join(folder, "fixture.mp4");
      await promisify(execFile)(process.env.FFMPEG_PATH || "ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=64x64:r=10",
        "-t",
        "0.3",
        "-c:v",
        "libx264",
        "-threads",
        "1",
        "-pix_fmt",
        "yuv420p",
        file,
      ]);
      const bytes = await readFile(file);
      await expect(processMedia(bytes, "video/mp4", false)).rejects.toThrow();
      const result = await processMedia(bytes, "video/mp4", true);
      expect(result.type).toBe("video/mp4");
      expect(result.bytes.subarray(4, 8).toString()).toBe("ftyp");
      expect(result.bytes.length).toBeGreaterThan(100);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
