import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { timeAgo } from "@/lib/time";
export default function Notifications() {
  const utils = trpc.useUtils();
  const inbox = trpc.features.inbox.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const read = trpc.features.readNotifications.useMutation({
    onSuccess: () => utils.features.inbox.invalidate(),
  });
  const action: Record<string, string> = {
    like: "liked your post",
    comment: "commented on your post",
    follow: "followed you",
    request: "requested to follow you",
  };
  return (
    <AppLayout>
      <div className="max-w-xl mx-auto p-4 sm:p-8">
        <div className="flex items-center justify-between gap-3 mb-6">
          <h1 className="text-xl font-semibold">Activity</h1>
          <Button
            variant="outline"
            size="sm"
            disabled={read.isPending}
            onClick={() => read.mutate()}
          >
            Mark all read
          </Button>
        </div>
        {inbox.isLoading && <p role="status">Loading activity…</p>}
        {inbox.error && <p role="alert">Activity could not be loaded.</p>}
        {inbox.data?.length === 0 && (
          <p className="text-sm text-neutral-500">
            Your activity will appear here.
          </p>
        )}
        <div className="space-y-2">
          {inbox.data?.map(n => (
            <Link
              key={n.id}
              to={
                n.kind === "request"
                  ? "/settings"
                  : n.postId
                    ? `/post/${n.postId}`
                    : `/${n.username}`
              }
              className={`block rounded-xl border p-4 text-sm ${!n.readAt ? "bg-neutral-50" : ""}`}
            >
              <span className="font-semibold">{n.username}</span>{" "}
              {action[n.kind]}
              <span className="block text-xs text-neutral-400 mt-1">
                {timeAgo(n.createdAt)} ago
              </span>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
