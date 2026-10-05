import sharp from "sharp";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
const run = promisify(execFile);
export async function processMedia(
  bytes: Buffer,
  type: string,
  videoAllowed: boolean
) {
  if (["image/jpeg", "image/png", "image/webp"].includes(type)) {
    if (bytes.length > 15 * 1024 * 1024) throw new Error("Image exceeds 15 MB");
    const image = sharp(bytes, {
      limitInputPixels: 40_000_000,
      animated: false,
    });
    const meta = await image.metadata();
    if (
      meta.format !==
        (
          {
            "image/jpeg": "jpeg",
            "image/png": "png",
            "image/webp": "webp",
          } as Record<string, string>
        )[type] ||
      (meta.pages || 1) > 1
    )
      throw new Error("Invalid image format");
    return {
      bytes: await image
        .rotate()
        .resize({
          width: 2048,
          height: 2048,
          fit: "inside",
          withoutEnlargement: true,
        })
        .webp({ quality: 85 })
        .toBuffer(),
      type: "image/webp",
      extension: "webp",
    };
  }
  if (
    !videoAllowed ||
    !["video/mp4", "video/webm"].includes(type) ||
    bytes.length > 20 * 1024 * 1024
  )
    throw new Error("Choose a supported image or a video up to 20 MB");
  if (
    (type === "video/mp4" && bytes.subarray(4, 8).toString() !== "ftyp") ||
    (type === "video/webm" &&
      !bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])))
  )
    throw new Error("Invalid video");
  const folder = await mkdtemp(path.join(tmpdir(), "t-media-"));
  try {
    const input = path.join(folder, "input"),
      output = path.join(folder, "output.mp4");
    await writeFile(input, bytes);
    const { stdout } = await run(
      process.env.FFPROBE_PATH || "ffprobe",
      [
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-show_entries",
        "format=duration:stream=width,height,codec_type",
        "-of",
        "json",
        input,
      ],
      { timeout: 10000, maxBuffer: 1024 * 1024 }
    );
    const info = JSON.parse(stdout) as {
      format?: { duration?: string };
      streams?: { width?: number; height?: number; codec_type?: string }[];
    };
    const video = info.streams?.find(s => s.codec_type === "video");
    const duration = Number(info.format?.duration);
    if (
      !video ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      duration > 60 ||
      (video.width || 0) * (video.height || 0) > 8_500_000
    )
      throw new Error("Video must be under 60 seconds and 4K");
    await run(
      process.env.FFMPEG_PATH || "ffmpeg",
      [
        "-v",
        "error",
        "-nostdin",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0?",
        "-map_metadata",
        "-1",
        "-t",
        "60",
        "-vf",
        "scale=w=1080:h=1080:force_original_aspect_ratio=decrease:force_divisible_by=2",
        "-c:v",
        "libx264",
        "-threads",
        "2",
        "-preset",
        "veryfast",
        "-crf",
        "24",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-movflags",
        "+faststart",
        output,
      ],
      { timeout: 60000, maxBuffer: 1024 * 1024 }
    );
    return {
      bytes: await readFile(output),
      type: "video/mp4",
      extension: "mp4",
    };
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
