import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Link } from "react-router";
export default function Admin() {
  const utils = trpc.useUtils();
  const reports = trpc.features.reports.useQuery(undefined, { retry: false });
  const review = trpc.features.reviewReport.useMutation({
    onSuccess: () => utils.invalidate(),
  });
  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto p-4 sm:p-8 space-y-4">
        <h1 className="text-xl font-semibold">Moderation queue</h1>
        {reports.error && (
          <p role="alert">
            You do not have access to moderation, or the service is unavailable.
          </p>
        )}
        {reports.data?.length === 0 && (
          <p className="text-sm text-neutral-500">No open reports.</p>
        )}
        {reports.data?.map(r => (
          <article key={r.id} className="border rounded-xl p-4 space-y-3">
            <Link className="text-sm underline" to={`/post/${r.postId}`}>
              View post {r.postId}
            </Link>
            <p className="text-sm whitespace-pre-wrap break-words">
              {r.reason}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={review.isPending}
                onClick={() => review.mutate({ id: r.id, remove: false })}
              >
                Keep post
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={review.isPending}
                onClick={() => review.mutate({ id: r.id, remove: true })}
              >
                Remove post
              </Button>
            </div>
          </article>
        ))}
      </div>
    </AppLayout>
  );
}
