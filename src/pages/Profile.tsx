import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { fileToUpload } from "@/lib/upload";
import { AppLayout } from "@/components/AppLayout";
import { Avatar } from "@/components/Avatar";
import { Modal } from "@/components/Modal";
import { MediaGrid } from "@/components/MediaGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
export default function Profile() {
  const { username = "" } = useParams();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const profile = trpc.social.profile.useQuery({ username });
  const posts = trpc.social.userPosts.useQuery({ username });
  const highlights = trpc.features.highlights.useQuery(
    { userId: profile.data?.userId || 1 },
    { enabled: !!profile.data }
  );
  const [edit, setEdit] = useState(false),
    [highlightId, setHighlightId] = useState<number | null>(null),
    [uploading, setUploading] = useState(false),
    [form, setForm] = useState({ username: "", displayName: "", bio: "" });
  const file = useRef<HTMLInputElement>(null);
  const follow = trpc.social.follow.useMutation({
      onSuccess: () => utils.invalidate(),
    }),
    block = trpc.features.block.useMutation({
      onSuccess: () => {
        utils.invalidate();
        navigate("/");
      },
    });
  const update = trpc.social.updateProfile.useMutation({
    onSuccess: () => {
      setEdit(false);
      utils.invalidate();
      if (form.username !== username) navigate(`/${form.username}`);
    },
  });
  const avatar = trpc.social.uploadAvatar.useMutation({
    onSuccess: () => utils.invalidate(),
  });
  const p = profile.data;
  const highlightGroups = [
    ...new Map(highlights.data?.map(h => [h.highlightId, h]) || []).values(),
  ];
  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        {profile.isLoading ? (
          <p role="status">Loading profile…</p>
        ) : !p ? (
          <p className="py-16 text-center text-sm text-neutral-500">
            This profile is unavailable.
          </p>
        ) : (
          <>
            <header className="flex items-start gap-4 sm:gap-8">
              <button
                className="shrink-0"
                aria-label={p.isMe ? "Change profile photo" : "Profile photo"}
                disabled={!p.isMe || uploading}
                onClick={() => file.current?.click()}
              >
                <Avatar
                  src={p.avatarUrl}
                  name={p.username}
                  size={80}
                  className="sm:!w-28 sm:!h-28"
                />
              </button>
              <input
                ref={file}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label="Avatar image"
                onChange={async e => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setUploading(true);
                  try {
                    await avatar.mutateAsync(await fileToUpload(f, "avatar"));
                  } catch (error) {
                    toast.error(
                      error instanceof Error ? error.message : "Upload failed"
                    );
                  } finally {
                    setUploading(false);
                  }
                }}
              />
              <div className="flex-1 min-w-0">
                <h1 className="text-lg font-semibold break-words">
                  {p.username}
                </h1>
                <div className="flex flex-wrap gap-2 mt-3">
                  {p.isMe ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setForm({
                            username: p.username,
                            displayName: p.displayName || "",
                            bio: p.bio || "",
                          });
                          setEdit(true);
                        }}
                      >
                        Edit profile
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/settings">Settings</Link>
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        size="sm"
                        variant={
                          p.isFollowing || p.requested ? "outline" : "default"
                        }
                        disabled={follow.isPending}
                        onClick={() =>
                          follow.mutate({
                            userId: p.userId,
                            follow: !(p.isFollowing || p.requested),
                          })
                        }
                      >
                        {p.isFollowing
                          ? "Following"
                          : p.requested
                            ? "Requested"
                            : "Follow"}
                      </Button>
                      <Button variant="outline" size="sm" asChild>
                        <Link to={`/messages?user=${p.userId}`}>Message</Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={block.isPending}
                        onClick={() =>
                          block.mutate({ userId: p.userId, block: true })
                        }
                      >
                        Block
                      </Button>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4 text-xs sm:text-sm">
                  <span>
                    <b>{p.postCount}</b> posts
                  </span>
                  <span>
                    <b>{p.followerCount}</b> followers
                  </span>
                  <span>
                    <b>{p.followingCount}</b> following
                  </span>
                </div>
              </div>
            </header>
            <div className="text-sm mt-5">
              <p className="font-medium break-words">{p.displayName}</p>
              <p className="whitespace-pre-wrap break-words text-neutral-600 mt-1">
                {p.bio}
              </p>
            </div>
            {highlightGroups.length > 0 && (
              <div className="flex gap-4 overflow-x-auto py-6">
                {highlightGroups.map(h => (
                  <button
                    key={h.highlightId}
                    className="shrink-0 w-16"
                    onClick={() => setHighlightId(h.highlightId)}
                  >
                    <img
                      src={h.url}
                      alt={h.title}
                      className="w-14 h-14 object-cover rounded-xl border"
                    />
                    <span className="block text-xs truncate mt-2">
                      {h.title}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="border-t mt-6 pt-4">
              {p.isPrivate && !p.isMe && !p.isFollowing ? (
                <p className="py-12 text-center text-sm text-neutral-500">
                  This account is private. Follow to request access.
                </p>
              ) : posts.error ? (
                <p role="alert" className="text-sm text-red-600">
                  Posts could not be loaded.
                </p>
              ) : posts.data?.length ? (
                <MediaGrid posts={posts.data} />
              ) : (
                <p className="py-12 text-center text-sm text-neutral-500">
                  No posts yet.
                </p>
              )}
            </div>
          </>
        )}
      </div>
      <Modal open={edit} onClose={() => setEdit(false)} title="Edit profile">
        <form
          className="space-y-4"
          onSubmit={e => {
            e.preventDefault();
            update.mutate(form);
          }}
        >
          <label className="block text-sm">
            Username
            <Input
              required
              minLength={3}
              maxLength={30}
              value={form.username}
              onChange={e =>
                setForm({ ...form, username: e.target.value.toLowerCase() })
              }
            />
          </label>
          <label className="block text-sm">
            Display name
            <Input
              maxLength={100}
              value={form.displayName}
              onChange={e => setForm({ ...form, displayName: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            Bio
            <Textarea
              maxLength={300}
              value={form.bio}
              onChange={e => setForm({ ...form, bio: e.target.value })}
            />
          </label>
          {update.error && (
            <p role="alert" className="text-sm text-red-600">
              {update.error.message}
            </p>
          )}
          <Button disabled={update.isPending}>Save changes</Button>
        </form>
      </Modal>
      <Modal
        open={highlightId !== null}
        title={
          highlightGroups.find(h => h.highlightId === highlightId)?.title ||
          "Highlight"
        }
        onClose={() => setHighlightId(null)}
      >
        <div className="space-y-3">
          {highlights.data
            ?.filter(h => h.highlightId === highlightId)
            .map(h => (
              <img
                key={h.storyId}
                src={h.url}
                alt={h.title}
                className="w-full max-h-[60dvh] object-contain rounded-xl"
              />
            ))}
        </div>
      </Modal>
    </AppLayout>
  );
}
