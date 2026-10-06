import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { MediaGrid } from "@/components/MediaGrid";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export default function Saved() {
  const utils = trpc.useUtils();
  const posts = trpc.social.saved.useQuery(),
    collections = trpc.community.collections.useQuery();
  const [selected, setSelected] = useState<number | null>(null),
    [name, setName] = useState("");
  const collection = trpc.community.collection.useQuery(
    { id: selected || 1 },
    { enabled: !!selected }
  );
  const create = trpc.community.createCollection.useMutation({
      onSuccess: () => {
        setName("");
        void utils.community.collections.invalidate();
      },
    }),
    remove = trpc.community.deleteCollection.useMutation({
      onSuccess: () => {
        setSelected(null);
        void utils.community.collections.invalidate();
      },
    });
  const q = selected ? collection : posts;
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-4">
        <h1 className="text-xl font-semibold">Saved posts</h1>
        <form
          className="flex gap-2"
          onSubmit={e => {
            e.preventDefault();
            create.mutate({ name });
          }}
        >
          <Input
            aria-label="Collection name"
            placeholder="New collection"
            maxLength={60}
            value={name}
            onChange={e => setName(e.target.value)}
          />
          <Button size="sm" disabled={!name.trim() || create.isPending}>
            Create
          </Button>
        </form>
        <div className="flex gap-2 flex-wrap">
          <Button
            size="sm"
            variant={selected ? "outline" : "default"}
            onClick={() => setSelected(null)}
          >
            All saved
          </Button>
          {collections.data?.map(c => (
            <Button
              className="max-w-full truncate"
              size="sm"
              variant={selected === c.id ? "default" : "outline"}
              key={c.id}
              onClick={() => setSelected(c.id)}
            >
              {c.name}
            </Button>
          ))}
          {selected && (
            <Button
              size="sm"
              variant="ghost"
              disabled={remove.isPending}
              onClick={() => remove.mutate({ id: selected })}
            >
              Delete collection
            </Button>
          )}
        </div>
        {q.isLoading ? (
          <p role="status">Loading saved posts…</p>
        ) : q.error ? (
          <p role="alert">Saved posts could not be loaded.</p>
        ) : q.data?.length ? (
          <MediaGrid posts={q.data} />
        ) : (
          <p className="py-12 text-center text-sm text-neutral-500">
            Save posts here. Use a post’s options to add it to a collection.
          </p>
        )}
      </div>
    </AppLayout>
  );
}
