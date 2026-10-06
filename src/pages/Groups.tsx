import { useAuth } from "@/hooks/useAuth";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fileToUpload } from "@/lib/upload";
export default function Groups() {
  const { user } = useAuth();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteThread = trpc.chat.deleteThread.useMutation({
    onSuccess: () => {
      setSelected(null);
      setConfirmDelete(false);
      void utils.chat.invalidate();
    },
  });
  const utils = trpc.useUtils(),
    [params] = useSearchParams();
  const [selected, setSelected] = useState<number | null>(null),
    [title, setTitle] = useState(""),
    [kind, setKind] = useState<"group" | "broadcast">("group"),
    [code, setCode] = useState(params.get("invite") || ""),
    [text, setText] = useState(""),
    [reply, setReply] = useState<number | undefined>(),
    [scheduled, setScheduled] = useState(""),
    [upload, setUpload] = useState<{ uploadId: string } | undefined>(),
    [uploading, setUploading] = useState(false),
    [invite, setInvite] = useState(""),
    [editing, setEditing] = useState<number | null>(null),
    [editText, setEdit] = useState(""),
    [translated, setTranslated] = useState<Record<number, string>>({});
  const attachment = useRef<HTMLInputElement>(null),
    inbox = trpc.chat.inbox.useQuery(undefined, { refetchInterval: 15000 });
  const chosen = inbox.data?.find(t => t.id === selected),
    enabled = !!selected && !!chosen?.accepted;
  const messages = trpc.chat.messages.useQuery(
      { threadId: selected || 1 },
      { enabled, refetchInterval: 5000 }
    ),
    details = trpc.chat.details.useQuery(
      { threadId: selected || 1 },
      { enabled, refetchInterval: 15000 }
    );
  const refresh = () => void utils.chat.invalidate();
  const create = trpc.chat.create.useMutation({
      onSuccess: r => {
        setTitle("");
        setSelected(r.id);
        refresh();
      },
    }),
    join = trpc.chat.join.useMutation({
      onSuccess: r => {
        setCode("");
        setSelected(r.id);
        refresh();
      },
    }),
    accept = trpc.chat.accept.useMutation({ onSuccess: refresh }),
    leave = trpc.chat.leave.useMutation({
      onSuccess: () => {
        setSelected(null);
        refresh();
      },
    }),
    getInvite = trpc.chat.invite.useMutation({
      onSuccess: r => setInvite(`${location.origin}/groups?invite=${r.code}`),
    }),
    send = trpc.chat.send.useMutation({
      onSuccess: () => {
        setText("");
        setReply(undefined);
        setScheduled("");
        setUpload(undefined);
        refresh();
      },
    }),
    update = trpc.chat.update.useMutation({
      onSuccess: () => {
        setEditing(null);
        setEdit("");
        refresh();
      },
    }),
    react = trpc.chat.react.useMutation({ onSuccess: refresh }),
    read = trpc.chat.read.useMutation(),
    translate = trpc.chat.translate.useMutation({
      onSuccess: (r, input) =>
        setTranslated(t => ({ ...t, [input.id]: r.translatedText })),
    });
  const markRead = read.mutate;
  const deliveredKey =
    messages.data
      ?.filter(m => new Date(m.deliverAt).getTime() <= Date.now())
      .map(m => m.id)
      .join(",") || "";
  const last = deliveredKey
    ? Math.max(...deliveredKey.split(",").map(Number))
    : undefined;
  useEffect(() => {
    if (selected && last) markRead({ threadId: selected, messageId: last });
  }, [selected, last, deliveredKey, markRead]);
  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-4">
        <h1 className="text-xl font-semibold">Groups & channels</h1>
        <p className="text-sm text-neutral-500">
          Up to 50 members. New members see messages sent after joining.
          Broadcast channels let only their owner publish.
        </p>
        <div className="grid md:grid-cols-[220px_minmax(0,1fr)] gap-4">
          <aside className="space-y-3 min-w-0">
            <form
              className="border rounded-xl p-3 space-y-2"
              onSubmit={e => {
                e.preventDefault();
                create.mutate({ title, kind });
              }}
            >
              <Input
                aria-label="Group name"
                maxLength={80}
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Name your group"
              />
              <select
                aria-label="Conversation type"
                className="w-full text-sm border rounded-md p-2"
                value={kind}
                onChange={e => setKind(e.target.value as typeof kind)}
              >
                <option value="group">Group chat</option>
                <option value="broadcast">Broadcast channel</option>
              </select>
              <Button size="sm" disabled={create.isPending || !title.trim()}>
                Create
              </Button>
            </form>
            <form
              className="border rounded-xl p-3 space-y-2"
              onSubmit={e => {
                e.preventDefault();
                let value = code;
                try {
                  value = new URL(code).searchParams.get("invite") || code;
                } catch {
                  /* pasted code */
                }
                join.mutate({ code: value });
              }}
            >
              <Input
                aria-label="Group invite code"
                placeholder="Paste invite link or code"
                value={code}
                onChange={e => setCode(e.target.value)}
              />
              <Button size="sm" disabled={join.isPending || !code}>
                Join
              </Button>
            </form>
            {inbox.error && <p role="alert">Conversations could not load.</p>}
            <nav
              aria-label="Conversations"
              className="max-h-60 md:max-h-96 overflow-y-auto space-y-1"
            >
              {inbox.data?.map(t => (
                <button
                  key={t.id}
                  className={`w-full rounded-lg p-3 text-left text-sm ${selected === t.id ? "bg-neutral-100" : "hover:bg-neutral-50"}`}
                  onClick={() => {
                    setSelected(t.id);
                    setText("");
                    setReply(undefined);
                    setUpload(undefined);
                    setInvite("");
                    setTranslated({});
                  }}
                >
                  <p className="truncate font-medium">{t.title}</p>
                  <p className="text-xs text-neutral-500">
                    {t.kind}
                    {!t.accepted ? " · request" : ""}
                  </p>
                </button>
              ))}
            </nav>
          </aside>
          <section className="border rounded-xl min-w-0 flex flex-col h-[75dvh]">
            {!selected ? (
              <p className="m-auto text-sm text-neutral-500">
                Create or choose a group.
              </p>
            ) : !chosen?.accepted ? (
              <div className="m-auto p-4 space-y-3">
                <p className="text-sm">
                  Accept this invitation to view new messages.
                </p>
                <Button
                  disabled={accept.isPending}
                  size="sm"
                  onClick={() => accept.mutate({ threadId: selected })}
                >
                  Accept
                </Button>
                <Button
                  disabled={leave.isPending}
                  variant="outline"
                  size="sm"
                  onClick={() => leave.mutate({ threadId: selected })}
                >
                  Decline
                </Button>
              </div>
            ) : (
              <>
                <header className="border-b p-3 space-y-2">
                  <p className="text-sm font-semibold truncate">
                    {chosen.title}
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {chosen.ownerId === user?.id ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={getInvite.isPending}
                        onClick={() => getInvite.mutate({ threadId: selected })}
                      >
                        Create invite
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={leave.isPending}
                        onClick={() => leave.mutate({ threadId: selected })}
                      >
                        Leave
                      </Button>
                    )}
                    {chosen.ownerId === user?.id && (
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={deleteThread.isPending}
                        onClick={() =>
                          confirmDelete
                            ? deleteThread.mutate({ threadId: selected })
                            : setConfirmDelete(true)
                        }
                      >
                        {confirmDelete
                          ? "Confirm delete channel"
                          : "Delete channel"}
                      </Button>
                    )}
                    <span className="text-xs text-neutral-500 self-center">
                      {details.data?.members.length ?? 0} members ·{" "}
                      {messages.data?.filter(m => m.pinned).length ?? 0}/3 pins
                    </span>
                  </div>
                  {invite && (
                    <Input
                      aria-label="Invite link"
                      readOnly
                      value={invite}
                      onFocus={e => e.currentTarget.select()}
                    />
                  )}
                </header>
                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
                  {messages.error && (
                    <p role="alert" className="text-sm">
                      Messages unavailable.{" "}
                      <button
                        className="underline"
                        onClick={() => void messages.refetch()}
                      >
                        Retry
                      </button>
                    </p>
                  )}
                  {messages.data?.map(m => (
                    <article
                      key={m.id}
                      className={`border rounded-xl p-3 max-w-[95%] text-sm ${m.isMine ? "ml-auto bg-neutral-50" : "mr-auto"}`}
                    >
                      <p className="text-xs text-neutral-500 mb-1">
                        {details.data?.members.find(
                          p => p.userId === m.senderId
                        )?.username ?? "Member"}
                        {m.pinned ? " · pinned" : ""}
                        {m.editedAt ? " · edited" : ""}
                      </p>
                      {m.replyId && (
                        <p className="border-l-2 pl-2 text-xs text-neutral-500 mb-2">
                          Reply:{" "}
                          {messages.data
                            ?.find(r => r.id === m.replyId)
                            ?.text.slice(0, 100) ||
                            "Earlier message unavailable"}
                        </p>
                      )}
                      {m.url &&
                        (m.contentType?.startsWith("video/") ? (
                          <video
                            className="max-h-64 w-full rounded-lg"
                            controls
                            preload="metadata"
                            src={m.url}
                          />
                        ) : (
                          <img
                            className="max-h-64 w-full object-contain rounded-lg"
                            alt="Message attachment"
                            src={m.url}
                          />
                        ))}
                      {editing === m.id ? (
                        <form
                          className="flex gap-2"
                          onSubmit={e => {
                            e.preventDefault();
                            update.mutate({
                              id: m.id,
                              action: "edit",
                              text: editText,
                            });
                          }}
                        >
                          <Input
                            aria-label="Edit message"
                            value={editText}
                            maxLength={2000}
                            onChange={e => setEdit(e.target.value)}
                          />
                          <Button size="sm" disabled={update.isPending}>
                            Save
                          </Button>
                        </form>
                      ) : (
                        <p className="whitespace-pre-wrap break-words">
                          {m.text}
                        </p>
                      )}
                      {translated[m.id] && (
                        <p className="mt-2 text-neutral-500">
                          {translated[m.id]}
                        </p>
                      )}
                      <p className="text-xs text-neutral-500 mt-2">
                        {new Date(m.deliverAt).getTime() > Date.now()
                          ? `Scheduled ${new Date(m.deliverAt).toLocaleString()}`
                          : new Date(m.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                        {m.isMine ? ` · Read by ${m.readBy}` : ""}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-2 mt-2 text-xs">
                        <button
                          className="underline"
                          onClick={() => setReply(m.id)}
                        >
                          Reply
                        </button>
                        <button
                          className="underline"
                          disabled={react.isPending}
                          aria-label="React to message"
                          onClick={() =>
                            react.mutate({ id: m.id, reaction: "❤️" })
                          }
                        >
                          ❤️ {m.reactions.length || ""}
                        </button>
                        <button
                          className="underline"
                          disabled={update.isPending}
                          onClick={() =>
                            update.mutate({
                              id: m.id,
                              action: m.pinned ? "unpin" : "pin",
                            })
                          }
                        >
                          {m.pinned ? "Unpin" : "Pin"}
                        </button>
                        {m.isMine && (
                          <>
                            <button
                              className="underline"
                              onClick={() => {
                                setEditing(m.id);
                                setEdit(m.text);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="underline"
                              disabled={update.isPending}
                              onClick={() =>
                                update.mutate({ id: m.id, action: "delete" })
                              }
                            >
                              Unsend
                            </button>
                          </>
                        )}
                        {details.data?.translationEnabled && (
                          <button
                            className="underline"
                            disabled={translate.isPending}
                            onClick={() =>
                              translate.mutate({ id: m.id, target: "en" })
                            }
                          >
                            Translate to English
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
                <form
                  className="p-3 border-t space-y-2"
                  onSubmit={e => {
                    e.preventDefault();
                    send.mutate({
                      threadId: selected,
                      text,
                      uploadId: upload?.uploadId,
                      replyId: reply,
                      deliverAt: scheduled ? new Date(scheduled) : undefined,
                    });
                  }}
                >
                  {reply && (
                    <p className="text-xs text-neutral-500">
                      Replying to a message{" "}
                      <button
                        className="underline"
                        type="button"
                        onClick={() => setReply(undefined)}
                      >
                        Cancel
                      </button>
                    </p>
                  )}
                  <div className="flex gap-2">
                    <Input
                      aria-label="Group message"
                      maxLength={2000}
                      placeholder="Message…"
                      value={text}
                      onChange={e => setText(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={
                        send.isPending || uploading || (!text.trim() && !upload)
                      }
                    >
                      Send
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={uploading}
                      onClick={() => attachment.current?.click()}
                    >
                      {uploading
                        ? "Uploading…"
                        : upload
                          ? "Attachment ready"
                          : "Attach media"}
                    </Button>
                    <label className="text-xs flex items-center gap-2 min-w-0">
                      Schedule
                      <Input
                        className="max-w-[190px]"
                        aria-label="Schedule message"
                        type="datetime-local"
                        value={scheduled}
                        onChange={e => setScheduled(e.target.value)}
                      />
                    </label>
                  </div>
                  <input
                    className="sr-only"
                    type="file"
                    ref={attachment}
                    accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
                    aria-label="Chat attachment"
                    onChange={async e => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (!f) return;
                      setUploading(true);
                      try {
                        setUpload(await fileToUpload(f, "chat"));
                      } catch (error) {
                        toast.error(
                          error instanceof Error
                            ? error.message
                            : "Upload failed"
                        );
                      } finally {
                        setUploading(false);
                      }
                    }}
                  />
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
