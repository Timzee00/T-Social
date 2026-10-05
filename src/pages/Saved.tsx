import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { MediaGrid } from "@/components/MediaGrid";
export default function Saved() {
  const posts = trpc.social.saved.useQuery();
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-6">Saved posts</h1>
        {posts.isLoading ? (
          <p role="status">Loading saved posts…</p>
        ) : posts.error ? (
          <p role="alert">Saved posts could not be loaded.</p>
        ) : posts.data?.length ? (
          <MediaGrid posts={posts.data} />
        ) : (
          <p className="py-12 text-center text-sm text-neutral-500">
            Tap the bookmark on a post to save it here.
          </p>
        )}
      </div>
    </AppLayout>
  );
}
