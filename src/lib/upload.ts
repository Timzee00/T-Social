export async function fileToUpload(
  file: File,
  purpose: "post" | "avatar" | "story" | "chat" | "instant" = "post"
) {
  const allowed = ["post", "story", "chat"].includes(purpose)
    ? ["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]
    : ["image/jpeg", "image/png", "image/webp"];
  if (
    !allowed.includes(file.type) ||
    !file.size ||
    file.size > 20 * 1024 * 1024
  )
    throw new Error("Choose a supported file up to 20 MB");
  const body = new FormData();
  body.set("file", file);
  body.set("purpose", purpose);
  const response = await fetch("/api/media/upload", { method: "POST", body });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Upload failed");
  return { uploadId: data.uploadId as string };
}
