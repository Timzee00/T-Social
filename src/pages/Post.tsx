import { useParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { PostCard } from "@/components/PostCard";
export default function Post() {
  const { postId } = useParams();
  const id = Number(postId);
  const post = trpc.social.post.useQuery(
    { postId: id },
    { enabled: Number.isSafeInteger(id) && id > 0 }
  );
  return (
    <AppLayout>
      <div className="max-w-lg mx-auto py-6 px-4">
        {post.isLoading ? (
          <p role="status">Loading post…</p>
        ) : post.data ? (
          <PostCard post={post.data} />
        ) : (
          <p className="py-12 text-center text-sm text-neutral-500">
            This post is unavailable.
          </p>
        )}
      </div>
    </AppLayout>
  );
}
