import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default function Library() {
  const [kind, setKind] = useState<"archive" | "deleted">("archive"),
    [selected, setSelected] = useState<number[]>([]),
    [title, setTitle] = useState("");
  const utils = trpc.useUtils();
  const posts = trpc.features.postLibrary.useQuery({ kind });
  const stories = trpc.features.storyArchive.useQuery();
  const profile = trpc.social.myProfile.useQuery();
  const highlights = trpc.features.highlights.useQuery(
    { userId: profile.data?.userId || 1 },
    { enabled: !!profile.data }
  );
  const manage = trpc.features.managePost.useMutation({
    onSuccess: () => utils.invalidate(),
  });
  const create = trpc.features.createHighlight.useMutation({
    onSuccess: () => {
      setSelected([]);
      setTitle("");
      utils.features.highlights.invalidate();
    },
  });
  const del = trpc.features.deleteHighlight.useMutation({
    onSuccess: () => utils.features.highlights.invalidate(),
  });
  const highlightGroups = [
    ...new Map(highlights.data?.map(h => [h.highlightId, h]) || []).values(),
  ];
  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
        <h1 className="text-xl font-semibold">Archive & highlights</h1>
        <div className="flex gap-2">
          <Button
            variant={kind === "archive" ? "default" : "outline"}
            size="sm"
            onClick={() => setKind("archive")}
          >
            Archived posts
          </Button>
          <Button
            variant={kind === "deleted" ? "default" : "outline"}
            size="sm"
            onClick={() => setKind("deleted")}
          >
            Recently deleted
          </Button>
        </div>
        {kind === "deleted" && (
          <p className="text-sm text-neutral-500">
            You can restore your deleted posts within 30 days.
          </p>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {posts.data?.map(p => (
            <div key={p.id} className="border rounded-xl overflow-hidden">
              <div className="aspect-square bg-neutral-100">
                {p.media[0]?.contentType.startsWith("video/") ? (
                  <video
                    src={p.media[0].url || ""}
                    preload="metadata"
                    muted
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src={p.imageUrl || ""}
                    alt={p.altText || "Archived post"}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="p-2">
                <Button
                  className="w-full"
                  variant="outline"
                  size="sm"
                  disabled={manage.isPending}
                  onClick={() =>
                    manage.mutate({
                      postId: p.id,
                      action: kind === "archive" ? "unarchive" : "restore",
                    })
                  }
                >
                  {kind === "archive" ? "Show on profile" : "Restore"}
                </Button>
              </div>
            </div>
          ))}
        </div>
        {posts.data?.length === 0 && (
          <p className="text-sm text-neutral-500">No posts here.</p>
        )}
        <section className="border-t pt-6 space-y-4">
          <h2 className="font-semibold">Story archive</h2>
          <p className="text-sm text-neutral-500">
            Select up to 20 Stories to create a highlight on your profile.
          </p>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {stories.data?.map(s => (
              <button
                key={s.id}
                aria-label={`Select story ${s.id}`}
                aria-pressed={selected.includes(s.id)}
                className={`relative aspect-[3/4] rounded-lg overflow-hidden border-2 ${selected.includes(s.id) ? "border-sky-500" : "border-transparent"}`}
                onClick={() =>
                  setSelected(ids =>
                    ids.includes(s.id)
                      ? ids.filter(x => x !== s.id)
                      : ids.length < 20
                        ? [...ids, s.id]
                        : ids
                  )
                }
              >
                <img
                  src={s.url}
                  alt="Story"
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={e => {
              e.preventDefault();
              create.mutate({ title, storyIds: selected });
            }}
          >
            <Input
              aria-label="Highlight title"
              placeholder="Highlight title"
              maxLength={40}
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
            <Button
              size="sm"
              disabled={!selected.length || !title.trim() || create.isPending}
            >
              Create
            </Button>
          </form>
          <div className="space-y-2">
            {highlightGroups.map(h => (
              <div
                className="flex justify-between items-center gap-3 text-sm"
                key={h.highlightId}
              >
                <span className="min-w-0 break-words">{h.title}</span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={del.isPending}
                  onClick={() => del.mutate({ id: h.highlightId })}
                >
                  Remove highlight
                </Button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
