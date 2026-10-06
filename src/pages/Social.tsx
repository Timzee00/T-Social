import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/Modal";
import { fileToUpload } from "@/lib/upload";
import { MediaGrid } from "@/components/MediaGrid";
export default function Social() {
  const utils = trpc.useUtils();
  const [note, setNote] = useState(""),
    [privateNote, setPrivate] = useState(false),
    [search, setSearch] = useState(""),
    [recipient, setRecipient] = useState<{
      userId: number;
      username: string;
    } | null>(null),
    [camera, setCamera] = useState(false),
    [busy, setBusy] = useState(false),
    [instant, setInstant] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null),
    stream = useRef<MediaStream | null>(null),
    notes = trpc.community.notes.useQuery(),
    lists = trpc.community.lists.useQuery(),
    instants = trpc.community.instants.useQuery(undefined, {
      refetchInterval: 30000,
    }),
    people = trpc.social.searchUsers.useQuery(
      { q: search },
      { enabled: search.trim().length > 0 }
    ),
    reels = trpc.community.friendsReels.useQuery();
  const refresh = () => void utils.community.invalidate();
  const update = trpc.community.relationshipUpdate.useMutation({
      onSuccess: refresh,
    }),
    saveNote = trpc.community.note.useMutation({
      onSuccess: () => {
        setNote("");
        refresh();
      },
    }),
    send = trpc.community.sendInstant.useMutation({
      onSuccess: () => {
        stop();
        toast.success("Instant sent");
        refresh();
      },
    }),
    open = trpc.community.openInstant.useMutation({
      onSuccess: r => {
        setInstant(r.image);
        refresh();
      },
    });
  function stop() {
    stream.current?.getTracks().forEach(t => t.stop());
    stream.current = null;
    setCamera(false);
  }
  useEffect(
    () => () => {
      stream.current?.getTracks().forEach(t => t.stop());
    },
    []
  );
  async function start() {
    setCamera(true);
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 } },
        audio: false,
      });
      stream.current = media;
      if (video.current) video.current.srcObject = media;
    } catch {
      stop();
      toast.error("Camera access is unavailable. Check browser permissions.");
    }
  }
  async function capture() {
    if (!video.current || !recipient || !stream.current) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.current.videoWidth;
      canvas.height = video.current.videoHeight;
      const context = canvas.getContext("2d");
      if (!context || !canvas.width) throw new Error("Camera is not ready");
      context.drawImage(video.current, 0, 0);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          b => (b ? resolve(b) : reject(new Error("Capture failed"))),
          "image/webp",
          0.9
        )
      );
      const media = await fileToUpload(
        new File([blob], "instant.webp", { type: "image/webp" }),
        "instant"
      );
      await send.mutateAsync({ ...media, recipients: [recipient.userId] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send");
    } finally {
      setBusy(false);
    }
  }
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-6">
        <h1 className="text-xl font-semibold">Friends</h1>
        <section className="border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Notes · 24 hours</h2>
          <form
            className="space-y-2"
            onSubmit={e => {
              e.preventDefault();
              saveNote.mutate({ text: note, closeFriends: privateNote });
            }}
          >
            <Input
              aria-label="Note"
              maxLength={60}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="Share a short thought"
            />
            <div className="flex items-center gap-3">
              <label className="text-sm flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={privateNote}
                  onChange={e => setPrivate(e.target.checked)}
                />
                Close Friends only
              </label>
              <Button size="sm" disabled={saveNote.isPending}>
                Share
              </Button>
            </div>
            <p className="text-xs text-neutral-500">
              Other notes are visible to mutual followers. Sharing an empty note
              removes yours.
            </p>
          </form>
          <div className="flex flex-wrap gap-2">
            {notes.data?.map(n => (
              <div key={n.id} className="border rounded-lg p-3 max-w-full">
                <Link to={`/${n.username}`} className="text-xs font-medium">
                  {n.username}
                </Link>
                <p className="text-sm break-words">{n.text}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Close Friends & restrict</h2>
          <Input
            aria-label="Find a friend"
            maxLength={50}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Find a username"
          />
          {people.data?.map(p => (
            <div
              className="flex flex-wrap justify-between items-center gap-2 border-b py-2"
              key={p.userId}
            >
              <Link className="text-sm break-words" to={`/${p.username}`}>
                {p.username}
              </Link>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({
                      userId: p.userId,
                      kind: "close_friend",
                      enabled: !lists.data?.closeFriends.some(
                        f => f.userId === p.userId
                      ),
                    })
                  }
                >
                  {lists.data?.closeFriends.some(f => f.userId === p.userId)
                    ? "Remove close friend"
                    : "Add close friend"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={update.isPending}
                  onClick={() =>
                    update.mutate({
                      userId: p.userId,
                      kind: "restrict",
                      enabled: !lists.data?.restricted.some(
                        f => f.userId === p.userId
                      ),
                    })
                  }
                >
                  {lists.data?.restricted.some(f => f.userId === p.userId)
                    ? "Unrestrict"
                    : "Restrict"}
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    setRecipient({ userId: p.userId, username: p.username })
                  }
                >
                  Choose for Instant
                </Button>
              </div>
            </div>
          ))}
          <p className="text-xs text-neutral-500">
            Close Friends:{" "}
            {lists.data?.closeFriends.map(p => p.username).join(", ") || "none"}
            . Restricted:{" "}
            {lists.data?.restricted.map(p => p.username).join(", ") || "none"}.
          </p>
          <p className="text-xs text-neutral-500">
            Restricted comments on your posts are visible only to you and their
            author.
          </p>
        </section>
        <section className="border rounded-xl p-4 space-y-3">
          <h2 className="font-semibold">Instants</h2>
          <p className="text-sm text-neutral-500">
            A camera photo for a Close Friend or mutual follower. Recipients can
            open it once before it expires in 24 hours. Closing it removes the
            picture here. Screenshots and recordings are still possible.
          </p>
          {recipient && <p className="text-sm">Send to {recipient.username}</p>}
          <Button size="sm" disabled={!recipient} onClick={() => void start()}>
            Open camera
          </Button>
          <div className="space-y-2">
            {instants.data?.map(i => (
              <div
                key={i.id}
                className="flex justify-between gap-3 text-sm border rounded-lg p-3"
              >
                <p className="break-words">From {i.username}</p>
                <Button
                  size="sm"
                  disabled={!!i.openedAt || open.isPending}
                  onClick={() => open.mutate({ id: i.id })}
                >
                  {i.openedAt ? "Opened" : "Open once"}
                </Button>
              </div>
            ))}
          </div>
          {instants.error && <p role="alert">Instants could not load.</p>}
        </section>
        <section>
          <h2 className="font-semibold mb-3">Friends in Reels</h2>
          {reels.data?.length ? (
            <MediaGrid posts={reels.data} />
          ) : (
            <p className="text-sm text-neutral-500">
              Reels from mutual followers appear here.
            </p>
          )}
        </section>
        <Modal open={camera} title="Capture an Instant" onClose={stop}>
          <video
            ref={video}
            autoPlay
            muted
            playsInline
            className="w-full max-h-[60dvh] rounded-lg"
          />
          <Button
            size="sm"
            disabled={busy || send.isPending}
            onClick={() => void capture()}
          >
            Capture & send to {recipient?.username}
          </Button>
        </Modal>
        <Modal
          open={!!instant}
          title="Instant · disappears when closed"
          onClose={() => {
            setInstant(null);
            open.reset();
          }}
        >
          {instant && (
            <img
              src={instant}
              className="w-full max-h-[65dvh] object-contain rounded-lg"
              alt="One-time Instant"
            />
          )}
        </Modal>
      </div>
    </AppLayout>
  );
}
