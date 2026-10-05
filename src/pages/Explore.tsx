import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { MediaGrid } from "@/components/MediaGrid";
export default function Explore() {
  const posts = trpc.social.explore.useQuery();
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-6">Explore</h1>
        {posts.isLoading ? (
          <p role="status">Loading posts…</p>
        ) : posts.error ? (
          <p role="alert">Posts could not be loaded.</p>
        ) : posts.data?.length ? (
          <MediaGrid posts={posts.data} />
        ) : (
          <p className="py-12 text-center text-sm text-neutral-500">
            Share something to start the conversation.
          </p>
        )}
      </div>
    </AppLayout>
  );
}
