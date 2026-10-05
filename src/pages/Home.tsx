import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { StoriesBar } from "@/components/StoriesBar";
import { PostCard, type FeedPost } from "@/components/PostCard";
import { Avatar } from "@/components/Avatar";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const utils = trpc.useUtils();
  const [mode, setMode] = useState<"all" | "following" | "reels">("all");
  const { data: myProfile } = trpc.social.myProfile.useQuery();
  const {
    data: feed,
    isLoading,
    isError,
    refetch,
  } = trpc.social.feed.useQuery({ limit: 30, mode });
  const { data: suggestions } = trpc.social.suggestions.useQuery();
  const follow = trpc.social.follow.useMutation({
    onSuccess: () => utils.social.suggestions.invalidate(),
  });

  return (
    <AppLayout>
      <div className="flex justify-center gap-16 px-4 pt-4 md:pt-8">
        {/* Feed column */}
        <div className="w-full max-w-[470px] min-w-0">
          <div className="bg-white md:border md:border-neutral-200 md:rounded-lg mb-4">
            <StoriesBar myUsername={myProfile?.username} />
          </div>

          <div
            className="flex gap-2 border-b mb-4 pb-3"
            role="tablist"
            aria-label="Feed mode"
          >
            {(["all", "following", "reels"] as const).map(m => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                onClick={() => setMode(m)}
                className={`px-3 py-2 text-sm rounded-lg ${mode === m ? "font-semibold bg-neutral-100" : "text-neutral-500"}`}
              >
                {m === "all"
                  ? "For you"
                  : m === "following"
                    ? "Following"
                    : "Reels"}
              </button>
            ))}
          </div>
          {isLoading &&
            [0, 1].map(i => (
              <div key={i} className="mb-6 border rounded-lg p-3 space-y-3">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-9 h-9 rounded-full" />
                  <Skeleton className="h-4 w-28" />
                </div>
                <Skeleton className="w-full aspect-square" />
              </div>
            ))}

          {isError && (
            <div role="alert" className="text-center py-12 border rounded-lg">
              <p className="text-sm text-neutral-600">
                Your feed could not be loaded.
              </p>
              <button
                onClick={() => void refetch()}
                className="mt-3 px-4 py-2 text-sm font-semibold rounded-lg bg-neutral-100"
              >
                Try again
              </button>
            </div>
          )}

          {feed?.length === 0 && (
            <div className="text-center py-16 border rounded-lg">
              <p className="text-lg font-semibold">Welcome to t</p>
              <p className="text-sm text-neutral-500 mt-1">
                Share your first photo — tap Create in the menu.
              </p>
            </div>
          )}

          {(feed as FeedPost[] | undefined)?.map(p => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>

        {/* Suggestions rail (desktop) */}
        <aside className="hidden xl:block w-[280px] shrink-0 pt-4">
          {myProfile && (
            <div className="flex items-center gap-3 mb-6">
              <Link to={`/${myProfile.username}`}>
                <Avatar
                  src={myProfile.avatarUrl}
                  name={myProfile.username}
                  size={44}
                />
              </Link>
              <div className="flex-1 min-w-0">
                <Link
                  to={`/${myProfile.username}`}
                  className="text-sm font-semibold block truncate"
                >
                  {myProfile.username}
                </Link>
                <p className="text-sm text-neutral-500 truncate">
                  {myProfile.displayName}
                </p>
              </div>
            </div>
          )}
          <p className="text-sm font-semibold text-neutral-500 mb-3">
            Suggested for you
          </p>
          <div className="space-y-3">
            {suggestions?.map(s => (
              <div key={s.userId} className="flex items-center gap-3">
                <Link to={`/${s.username}`}>
                  <Avatar src={s.avatarUrl} name={s.username} size={40} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link
                    to={`/${s.username}`}
                    className="text-sm font-semibold block truncate"
                  >
                    {s.username}
                  </Link>
                  <p className="text-xs text-neutral-500 truncate">
                    Suggested for you
                  </p>
                </div>
                <button
                  disabled={follow.isPending}
                  onClick={() =>
                    follow.mutate({ userId: s.userId, follow: !s.isFollowing })
                  }
                  className="text-xs font-semibold text-sky-500 hover:text-sky-700"
                >
                  {s.isFollowing ? "Following" : "Follow"}
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-neutral-300 mt-8">
            © 2026 t · Powered by timzee corp
          </p>
        </aside>
      </div>
    </AppLayout>
  );
}
