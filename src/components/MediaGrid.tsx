import { useState } from "react";
import { Play, Layers } from "lucide-react";
import { Modal } from "./Modal";
import { PostCard, type FeedPost } from "./PostCard";
export function MediaGrid({ posts }: { posts: FeedPost[] }) {
  const [id, setId] = useState<number | null>(null);
  const current = posts.find(p => p.id === id);
  return (
    <>
      <div className="grid grid-cols-3 gap-1 sm:gap-2">
        {posts.map(p => (
          <button
            key={p.id}
            aria-label={`Open post by ${p.author.username}`}
            className="relative aspect-square overflow-hidden rounded-md bg-neutral-100"
            onClick={() => setId(p.id)}
          >
            {p.media[0]?.contentType.startsWith("video/") ? (
              <>
                <video
                  src={p.media[0].url || ""}
                  preload="metadata"
                  muted
                  className="w-full h-full object-cover"
                />
                <Play className="absolute top-2 right-2 text-white w-4 h-4 fill-white drop-shadow" />
              </>
            ) : (
              <img
                src={p.imageUrl || ""}
                alt={p.altText || "Shared photo"}
                loading="lazy"
                className="w-full h-full object-cover"
              />
            )}
            {p.media.length > 1 && (
              <Layers className="absolute top-2 right-2 w-4 h-4 text-white drop-shadow" />
            )}
          </button>
        ))}
      </div>
      <Modal
        open={!!current}
        title="Post"
        onClose={() => setId(null)}
        className="p-3"
      >
        {current && <PostCard post={current} />}
      </Modal>
    </>
  );
}
