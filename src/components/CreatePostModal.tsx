import { useEffect, useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { fileToUpload } from "@/lib/upload";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Modal } from "./Modal";
export function CreatePostModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils(),
    fileRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]),
    [caption, setCaption] = useState(""),
    [location, setLocation] = useState(""),
    [altText, setAltText] = useState(""),
    [kind, setKind] = useState<"post" | "reel">("post"),
    [error, setError] = useState(""),
    [progress, setProgress] = useState(0),
    [uploading, setUploading] = useState(false);
  const [previews, setPreviews] = useState<string[]>([]);
  useEffect(() => {
    const urls = files.map(f => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [files]);
  const create = trpc.social.createPost.useMutation({
    onSuccess: async () => {
      await utils.social.invalidate();
      setFiles([]);
      setCaption("");
      setLocation("");
      setAltText("");
      onClose();
    },
    onError: e => setError(e.message),
  });
  const pending = create.isPending || uploading;
  function close() {
    if (!pending) {
      setFiles([]);
      setError("");
      onClose();
    }
  }
  return (
    <Modal open={open} onClose={close} title="Create a post">
      <form
        className="space-y-4"
        onSubmit={async e => {
          e.preventDefault();
          if (!files.length || pending) return;
          setUploading(true);
          setError("");
          setProgress(0);
          try {
            const uploadIds: string[] = [];
            for (const file of files) {
              uploadIds.push((await fileToUpload(file)).uploadId);
              setProgress(uploadIds.length);
            }
            create.mutate({ uploadIds, caption, location, altText, kind });
          } catch (e) {
            setError(e instanceof Error ? e.message : "Upload failed");
          } finally {
            setUploading(false);
          }
        }}
      >
        {previews.length ? (
          <div className="flex gap-2 overflow-x-auto">
            {previews.map((url, i) =>
              files[i]?.type.startsWith("video/") ? (
                <video
                  key={url}
                  src={url}
                  controls
                  className="w-full max-h-[28dvh] rounded-xl bg-neutral-50"
                />
              ) : (
                <img
                  key={url}
                  src={url}
                  alt={`Preview ${i + 1}`}
                  className="w-full max-h-[28dvh] object-contain rounded-xl bg-neutral-50"
                />
              )
            )}
          </div>
        ) : (
          <button
            type="button"
            className="w-full h-40 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed text-sm text-neutral-500"
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus className="h-8 w-8" />
            Choose up to 10 photos or videos
          </button>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          multiple
          className="sr-only"
          aria-label="Post media"
          disabled={pending}
          onChange={e => {
            const selected = [...(e.target.files || [])];
            if (selected.length > 10) {
              setError("Choose up to 10 files");
            } else if (selected.some(f => f.size > 20 * 1024 * 1024)) {
              setError("Each file must be under 20 MB");
            } else {
              setFiles(selected);
              setError("");
            }
            e.target.value = "";
          }}
        />
        {files.length > 0 && (
          <button
            type="button"
            disabled={pending}
            onClick={() => fileRef.current?.click()}
            className="text-sm underline"
          >
            Change media
          </button>
        )}
        {files.length === 1 && files[0].type.startsWith("video/") && (
          <label className="text-sm flex items-center gap-2">
            <input
              type="checkbox"
              checked={kind === "reel"}
              onChange={e => setKind(e.target.checked ? "reel" : "post")}
            />
            Share as a Reel
          </label>
        )}
        <label className="block text-sm font-medium">
          Caption
          <Textarea
            className="mt-1"
            value={caption}
            maxLength={2200}
            rows={3}
            onChange={e => setCaption(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Location
          <Input
            className="mt-1"
            value={location}
            maxLength={120}
            onChange={e => setLocation(e.target.value)}
          />
        </label>
        <label className="block text-sm font-medium">
          Image description
          <Input
            className="mt-1"
            value={altText}
            maxLength={500}
            placeholder="Describe the image for screen readers"
            onChange={e => setAltText(e.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <Button
          type="submit"
          className="w-full h-10"
          disabled={!files.length || pending}
        >
          {uploading
            ? `Uploading ${progress}/${files.length}…`
            : create.isPending
              ? "Sharing…"
              : "Share post"}
        </Button>
      </form>
    </Modal>
  );
}
