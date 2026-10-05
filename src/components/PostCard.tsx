import { useState } from "react";
import { Link } from "react-router";
import {
  Heart,
  MessageCircle,
  Send,
  Bookmark,
  MoreHorizontal,
  ChevronLeft,
  ChevronRight,
  Pin,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { timeAgo } from "@/lib/time";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../api/router";
import { Avatar } from "./Avatar";
import { Modal } from "./Modal";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
export type FeedPost = inferRouterOutputs<AppRouter>["social"]["post"];
export function PostCard({ post }: { post: FeedPost }) {
  const utils = trpc.useUtils();
  const [commentsOpen, setCommentsOpen] = useState(false),
    [menuOpen, setMenuOpen] = useState(false),
    [reportOpen, setReportOpen] = useState(false),
    [text, setText] = useState(""),
    [reason, setReason] = useState(""),
    [slide, setSlide] = useState(0);
  const invalidate = () => utils.invalidate();
  const like = trpc.social.like.useMutation({ onSuccess: invalidate }),
    save = trpc.social.save.useMutation({ onSuccess: invalidate }),
    del = trpc.social.deletePost.useMutation({
      onSuccess: () => {
        setMenuOpen(false);
        invalidate();
      },
    }),
    manage = trpc.features.managePost.useMutation({
      onSuccess: () => {
        setMenuOpen(false);
        invalidate();
      },
    });
  const addComment = trpc.social.addComment.useMutation({
    onSuccess: () => {
      setText("");
      invalidate();
    },
  });
  const removeComment = trpc.features.deleteComment.useMutation({
    onSuccess: invalidate,
  });
  const report = trpc.features.report.useMutation({
    onSuccess: () => {
      setReportOpen(false);
      setReason("");
      toast.success("Report received");
    },
  });
  const comments = trpc.social.comments.useQuery(
    { postId: post.id },
    { enabled: commentsOpen }
  );
  const media = post.media.length
    ? post.media
    : [{ url: post.imageUrl, contentType: "image/webp" }];
  const current = media[Math.min(slide, media.length - 1)];
  function comment() {
    if (text.trim() && !addComment.isPending)
      addComment.mutate({ postId: post.id, text: text.trim() });
  }
  return (
    <article className="border rounded-xl overflow-hidden bg-white mb-6">
      <header className="flex items-center gap-3 px-3 py-2">
        <Link to={`/${post.author.username}`}>
          <Avatar
            src={post.author.avatarUrl}
            name={post.author.username}
            size={36}
          />
        </Link>
        <div className="flex-1 min-w-0">
          <Link
            to={`/${post.author.username}`}
            className="text-sm font-semibold block truncate"
          >
            {post.author.username}
          </Link>
          {post.location && (
            <p className="text-xs text-neutral-500 truncate">{post.location}</p>
          )}
        </div>
        {post.pinnedAt && <Pin className="w-4 h-4" aria-label="Pinned post" />}
        <button
          className="icon-button"
          aria-label="Post options"
          onClick={() => setMenuOpen(true)}
        >
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </header>
      <div
        className="relative bg-neutral-50 select-none min-h-24"
        onDoubleClick={() => {
          if (!post.likedByMe && !like.isPending)
            like.mutate({ postId: post.id, like: true });
        }}
      >
        {current?.url ? (
          current.contentType.startsWith("video/") ? (
            <video
              src={current.url}
              controls
              playsInline
              preload="metadata"
              className="w-full max-h-[70dvh]"
            />
          ) : (
            <img
              src={current.url}
              alt={post.altText || post.caption || "Shared photo"}
              loading="lazy"
              className="w-full max-h-[70dvh] object-contain"
              draggable={false}
            />
          )
        ) : (
          <p className="py-12 text-center text-sm text-neutral-500">
            Media unavailable
          </p>
        )}
        {media.length > 1 && (
          <>
            <span className="absolute top-3 right-3 bg-black/60 text-white rounded-full px-2 py-1 text-xs">
              {slide + 1}/{media.length}
            </span>
            {slide > 0 && (
              <button
                className="icon-button absolute left-2 top-1/2 -translate-y-1/2 bg-white/90"
                aria-label="Previous media"
                onClick={() => setSlide(x => x - 1)}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            {slide < media.length - 1 && (
              <button
                className="icon-button absolute right-2 top-1/2 -translate-y-1/2 bg-white/90"
                aria-label="Next media"
                onClick={() => setSlide(x => x + 1)}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </>
        )}
      </div>
      <div className="flex items-center px-2 pt-1">
        <button
          className="icon-button"
          aria-label={post.likedByMe ? "Unlike" : "Like"}
          aria-pressed={post.likedByMe}
          disabled={like.isPending}
          onClick={() =>
            like.mutate({ postId: post.id, like: !post.likedByMe })
          }
        >
          <Heart
            className={`w-5 h-5 ${post.likedByMe ? "fill-red-500 text-red-500" : ""}`}
          />
        </button>
        <button
          className="icon-button"
          aria-label="Comments"
          onClick={() => setCommentsOpen(true)}
        >
          <MessageCircle className="w-5 h-5" />
        </button>
        <button
          className="icon-button"
          aria-label="Share post"
          onClick={async () => {
            const url = `${location.origin}/post/${post.id}`;
            try {
              if (navigator.share) await navigator.share({ url });
              else {
                await navigator.clipboard.writeText(url);
                toast.success("Post link copied");
              }
            } catch (e) {
              if (!(e instanceof Error && e.name === "AbortError"))
                toast.error("Could not share this post");
            }
          }}
        >
          <Send className="w-5 h-5" />
        </button>
        <div className="flex-1" />
        <button
          className="icon-button"
          aria-label={post.savedByMe ? "Unsave" : "Save"}
          aria-pressed={post.savedByMe}
          disabled={save.isPending}
          onClick={() =>
            save.mutate({ postId: post.id, save: !post.savedByMe })
          }
        >
          <Bookmark
            className={`w-5 h-5 ${post.savedByMe ? "fill-neutral-900" : ""}`}
          />
        </button>
      </div>
      <div className="px-4 pb-4 text-sm">
        <p className="font-semibold">{post.likeCount.toLocaleString()} likes</p>
        {post.caption && (
          <p className="mt-1 whitespace-pre-wrap break-words">
            <Link
              className="font-semibold mr-2"
              to={`/${post.author.username}`}
            >
              {post.author.username}
            </Link>
            {post.caption}
          </p>
        )}
        {post.commentCount > 0 && (
          <button
            className="text-neutral-500 mt-1"
            onClick={() => setCommentsOpen(true)}
          >
            View {post.commentCount} comments
          </button>
        )}
        <p className="text-xs text-neutral-400 mt-2">
          {timeAgo(post.createdAt)} ago
        </p>
        <form
          className="flex gap-2 items-center mt-3 border-t pt-3"
          onSubmit={e => {
            e.preventDefault();
            comment();
          }}
        >
          <Input
            aria-label="Comment"
            placeholder="Add a comment…"
            className="flex-1 min-w-0 h-9"
            maxLength={500}
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <Button
            size="sm"
            variant="ghost"
            disabled={!text.trim() || addComment.isPending}
          >
            Post
          </Button>
        </form>
      </div>
      <Modal
        open={menuOpen}
        title="Post options"
        onClose={() => setMenuOpen(false)}
      >
        <div className="space-y-2">
          {post.isMine ? (
            <>
              <Button
                className="w-full"
                variant="outline"
                disabled={manage.isPending}
                onClick={() =>
                  manage.mutate({
                    postId: post.id,
                    action: post.pinnedAt ? "unpin" : "pin",
                  })
                }
              >
                {post.pinnedAt ? "Unpin" : "Pin to profile"}
              </Button>
              <Button
                className="w-full"
                variant="outline"
                disabled={manage.isPending}
                onClick={() =>
                  manage.mutate({ postId: post.id, action: "archive" })
                }
              >
                Archive post
              </Button>
              <Button
                className="w-full"
                variant="destructive"
                disabled={del.isPending}
                onClick={() => del.mutate({ postId: post.id })}
              >
                Move to Recently Deleted
              </Button>
            </>
          ) : (
            <Button
              className="w-full"
              variant="outline"
              onClick={() => {
                setMenuOpen(false);
                setReportOpen(true);
              }}
            >
              Report post
            </Button>
          )}
        </div>
      </Modal>
      <Modal
        open={reportOpen}
        title="Report this post"
        onClose={() => setReportOpen(false)}
      >
        <form
          className="space-y-3"
          onSubmit={e => {
            e.preventDefault();
            report.mutate({ postId: post.id, reason });
          }}
        >
          <label className="block text-sm">
            Tell us what’s wrong
            <Input
              value={reason}
              maxLength={500}
              minLength={5}
              required
              onChange={e => setReason(e.target.value)}
            />
          </label>
          <Button disabled={report.isPending || reason.trim().length < 5}>
            Submit report
          </Button>
        </form>
      </Modal>
      <Modal
        open={commentsOpen}
        title="Comments"
        onClose={() => setCommentsOpen(false)}
      >
        <div className="space-y-4 max-h-[50dvh] overflow-y-auto">
          {comments.isLoading && (
            <p role="status" className="text-sm">
              Loading comments…
            </p>
          )}
          {comments.error && (
            <p role="alert" className="text-sm text-red-600">
              Comments could not be loaded.
            </p>
          )}
          {comments.data?.length === 0 && (
            <p className="text-sm text-neutral-500">No comments yet.</p>
          )}
          {comments.data?.map(c => (
            <div key={c.id} className="flex gap-3">
              <Avatar src={c.avatarUrl} name={c.username} size={32} />
              <div className="flex-1 min-w-0 text-sm break-words">
                <Link to={`/${c.username}`} className="font-semibold mr-2">
                  {c.username}
                </Link>
                <span className="whitespace-pre-wrap break-words">
                  {c.text}
                </span>
                <p className="text-xs text-neutral-400 mt-1">
                  {timeAgo(c.createdAt)} ago
                </p>
              </div>
              {(c.isMine || post.isMine) && (
                <button
                  aria-label="Delete comment"
                  className="text-xs underline shrink-0"
                  disabled={removeComment.isPending}
                  onClick={() => removeComment.mutate({ commentId: c.id })}
                >
                  Delete
                </button>
              )}
            </div>
          ))}
        </div>
        <form
          className="flex gap-2"
          onSubmit={e => {
            e.preventDefault();
            comment();
          }}
        >
          <Input
            aria-label="Comment"
            placeholder="Add a comment…"
            maxLength={500}
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <Button size="sm" disabled={!text.trim() || addComment.isPending}>
            Post
          </Button>
        </form>
      </Modal>
    </article>
  );
}
