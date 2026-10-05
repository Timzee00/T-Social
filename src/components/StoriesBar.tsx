import { useEffect, useRef, useState } from "react";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { fileToUpload } from "@/lib/upload";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { Button } from "./ui/button";
export function StoriesBar({ myUsername }: { myUsername?: string }) {
  const utils = trpc.useUtils();
  const groups = trpc.social.stories.useQuery();
  const file = useRef<HTMLInputElement>(null);
  const [id, setId] = useState<number | null>(null),
    [uploading, setUploading] = useState(false);
  const view = trpc.features.viewStory.useMutation();
  const markView = view.mutate;
  const flat =
    groups.data?.flatMap(g =>
      g.items.map(item => ({
        ...item,
        username: g.username,
        avatarUrl: g.avatarUrl,
      }))
    ) || [];
  const index = flat.findIndex(s => s.id === id);
  const current = flat[index];
  const mine = current?.username === myUsername;
  const viewers = trpc.features.storyViewers.useQuery(
    { storyId: id || 1 },
    { enabled: !!id && mine }
  );
  const remove = trpc.features.deleteStory.useMutation({
    onSuccess: () => {
      setId(null);
      utils.social.stories.invalidate();
    },
  });
  const add = trpc.social.addStory.useMutation({
    onSuccess: () => utils.social.stories.invalidate(),
  });
  useEffect(() => {
    if (id) markView({ storyId: id });
  }, [id, markView]);
  return (
    <>
      <div className="flex gap-4 overflow-x-auto p-4 scrollbar-none">
        <button
          className="flex flex-col items-center gap-2 shrink-0"
          disabled={uploading || add.isPending}
          onClick={() => file.current?.click()}
        >
          <div className="relative">
            <Avatar name={myUsername || "me"} size={52} />
            <span className="absolute -bottom-1 -right-1 bg-white rounded-full border p-1">
              <Plus className="w-3 h-3" />
            </span>
          </div>
          <span className="text-xs text-neutral-500">
            {uploading ? "Uploading…" : "Your story"}
          </span>
        </button>
        {groups.data?.map(g => (
          <button
            key={g.userId}
            aria-label={`View ${g.username} stories`}
            className="flex flex-col items-center gap-2 shrink-0 w-16"
            onClick={() => setId(g.items[0]?.id || null)}
          >
            <Avatar
              src={g.avatarUrl}
              name={g.username}
              size={52}
              ring={!g.items.every(i => i.viewed)}
            />
            <span className="text-xs text-neutral-500 truncate w-full">
              {g.username}
            </span>
          </button>
        ))}
      </div>
      {groups.error && (
        <p role="alert" className="text-xs text-red-600 px-4 pb-2">
          Stories could not be loaded.
        </p>
      )}
      <input
        ref={file}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label="Story image"
        onChange={async e => {
          const picked = e.target.files?.[0];
          e.target.value = "";
          if (!picked) return;
          setUploading(true);
          try {
            await add.mutateAsync(await fileToUpload(picked, "story"));
          } catch (error) {
            toast.error(
              error instanceof Error ? error.message : "Upload failed"
            );
          } finally {
            setUploading(false);
          }
        }}
      />
      <Modal
        open={!!current}
        onClose={() => {
          setId(null);
          utils.social.stories.invalidate();
        }}
        title={current ? `${current.username} · Story` : "Story"}
      >
        {current && (
          <>
            <img
              src={current.url || ""}
              alt={`${current.username}'s story`}
              className="max-h-[65dvh] w-full object-contain rounded-lg bg-neutral-50"
            />
            <div className="flex items-center justify-between">
              <Button
                aria-label="Previous story"
                variant="outline"
                size="sm"
                disabled={index <= 0}
                onClick={() => setId(flat[index - 1].id)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-xs text-neutral-500">
                {index + 1}/{flat.length}
              </span>
              <Button
                aria-label="Next story"
                variant="outline"
                size="sm"
                disabled={index >= flat.length - 1}
                onClick={() => setId(flat[index + 1].id)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            {mine && (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate({ storyId: current.id })}
                >
                  Delete story
                </Button>
                <p className="text-xs text-neutral-500">
                  Viewed by{" "}
                  {viewers.data?.map(v => v.username).join(", ") ||
                    "no one yet"}
                </p>
              </>
            )}
          </>
        )}
      </Modal>
    </>
  );
}
