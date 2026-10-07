import { useAuth } from "@/hooks/useAuth";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MessageReactions } from "@/components/MessageReactions";
import { fileToUpload } from "@/lib/upload";
import { MentionText } from "@/components/MentionText";
export default function Groups() {
  const { user } = useAuth();
  const activeThread = useRef<number | null>(null);
  const conversationVersion = useRef(0);
  const [history, setHistory] = useState<number[]>([]);
  const [showPins, setShowPins] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const deleteThread = trpc.chat.deleteThread.useMutation({
    onSuccess: (_r, input) => {
      if (activeThread.current === input.threadId) selectConversation(null);
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
    [translated, setTranslated] = useState<Record<number, string>>({}),
    [settingsThread, setSettingsThread] = useState<number | null>(null),
    [memberTag, setMemberTag] = useState(""),
    [groupNotifications, setGroupNotifications] = useState<
      "all" | "mentions" | "muted"
    >("all"),
    [groupTitle, setGroupTitle] = useState(""),
    [groupDescription, setGroupDescription] = useState(""),
    [groupHandle, setGroupHandle] = useState("");
  const attachment = useRef<HTMLInputElement>(null),
    inbox = trpc.chat.inbox.useQuery(undefined, { refetchInterval: 15000 });
  const chosen = inbox.data?.find(t => t.id === selected),
    enabled = !!selected && !!chosen?.accepted;
  const pins = trpc.chat.messages.useQuery(
    { threadId: selected || 1, pinnedOnly: true },
    { enabled, refetchInterval: 15000 }
  );
  const messages = trpc.chat.messages.useQuery(
      { threadId: selected || 1, before: history.at(-1) },
      { enabled, refetchInterval: 5000 }
    ),
    details = trpc.chat.details.useQuery(
      { threadId: selected || 1 },
      { enabled, refetchInterval: 15000 }
    );
  const displayed = showPins ? pins : messages;
  const canPublish =
    chosen?.kind !== "broadcast" || chosen.ownerId === user?.id;
  function selectConversation(value: number | null) {
    conversationVersion.current += 1;
    activeThread.current = value;
    setSelected(value);
    setText("");
    setReply(undefined);
    setScheduled("");
    setUpload(undefined);
    setInvite("");
    setTranslated({});
    setEditing(null);
    setEdit("");
    setConfirmDelete(false);
    setSettingsThread(null);
    setHistory([]);
    setShowPins(false);
  }
  const refresh = () => void utils.chat.invalidate();
  const create = trpc.chat.create.useMutation({
      onSuccess: r => {
        setTitle("");
        selectConversation(r.id);
        refresh();
      },
    }),
    join = trpc.chat.join.useMutation({
      onSuccess: r => {
        setCode("");
        selectConversation(r.id);
        refresh();
      },
    }),
    accept = trpc.chat.accept.useMutation({ onSuccess: refresh }),
    leave = trpc.chat.leave.useMutation({
      onSuccess: (_r, input) => {
        if (activeThread.current === input.threadId) selectConversation(null);
        refresh();
      },
    }),
    getInvite = trpc.chat.invite.useMutation({
      onSuccess: (r, input) => {
        if (activeThread.current === input.threadId)
          setInvite(`${location.origin}/groups?invite=${r.code}`);
      },
    }),
    send = trpc.chat.send.useMutation({
      onMutate: () => ({ version: conversationVersion.current }),
      onSuccess: (_r, input, context) => {
        if (
          activeThread.current === input.threadId &&
          context?.version === conversationVersion.current
        ) {
          setText("");
          setReply(undefined);
          setScheduled("");
          setUpload(undefined);
          setHistory([]);
          setShowPins(false);
        }
        refresh();
      },
    }),
    update = trpc.chat.update.useMutation({
      onMutate: () => ({ version: conversationVersion.current }),
      onSuccess: (_r, _input, context) => {
        if (context?.version === conversationVersion.current) {
          setEditing(null);
          setEdit("");
        }
        refresh();
      },
    }),
    saveMembership = trpc.chat.updateMembership.useMutation({
      onSuccess: () => {
        toast.success("Your group settings were saved");
        refresh();
      },
    }),
    saveThread = trpc.chat.updateThread.useMutation({
      onSuccess: () => {
        toast.success("Group details updated");
        refresh();
      },
    }),
    read = trpc.chat.readDisplayed.useMutation(),
    translate = trpc.chat.translate.useMutation({
      onMutate: () => ({ version: conversationVersion.current }),
      onSuccess: (r, input, context) => {
        if (context?.version === conversationVersion.current)
          setTranslated(t => ({ ...t, [input.id]: r.translatedText }));
      },
    });
  useEffect(() => {
    if (!inbox.data?.length || selected) return;
    const requestedId = Number(params.get("thread"));
    const requestedHandle = params.get("group")?.toLowerCase();
    const target = inbox.data.find(
      thread =>
        (Number.isSafeInteger(requestedId) &&
          requestedId > 0 &&
          thread.id === requestedId) ||
        (!!requestedHandle && thread.handle === requestedHandle)
    );
    if (target) selectConversation(target.id);
  }, [inbox.data, params, selected]);

  useEffect(() => {
    if (!selected || !details.data || settingsThread === selected) return;
    setSettingsThread(selected);
    setMemberTag(details.data.membership.memberTag || "");
    setGroupNotifications(details.data.membership.notifications);
    setGroupTitle(details.data.thread.title);
    setGroupDescription(details.data.thread.description || "");
    setGroupHandle(details.data.thread.handle || "");
  }, [details.data, selected, settingsThread]);

  const markRead = read.mutate;
  const deliveredKey =
    displayed.data
      ?.filter(m => new Date(m.deliverAt).getTime() <= Date.now())
      .map(m => m.id)
      .join(",") || "";
  useEffect(() => {
    if (
      enabled &&
      selected &&
      deliveredKey &&
      !document.hidden &&
      !displayed.isError
    )
      markRead({
        threadId: selected,
        messageIds: deliveredKey.split(",").map(Number),
      });
  }, [enabled, selected, deliveredKey, displayed.isError, markRead]);
  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-4 sm:p-8 space-y-4 page-enter">
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
                    selectConversation(t.id);
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
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {chosen.title}
                    </p>
                    {details.data?.thread.handle && (
                      <p className="text-xs text-neutral-500 truncate">
                        @group:{details.data.thread.handle}
                        {details.data.thread.description
                          ? ` · ${details.data.thread.description}`
                          : ""}
                      </p>
                    )}
                  </div>
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
                      {pins.data?.length ?? 0}/3 visible pins
                    </span>
                  </div>
                  <div
                    className="flex flex-wrap gap-2"
                    role="group"
                    aria-label="Conversation views"
                  >
                    <Button
                      size="sm"
                      variant={showPins ? "outline" : "secondary"}
                      aria-pressed={!showPins}
                      onClick={() => setShowPins(false)}
                    >
                      Messages
                    </Button>
                    <Button
                      size="sm"
                      variant={showPins ? "secondary" : "outline"}
                      aria-pressed={showPins}
                      onClick={() => setShowPins(true)}
                    >
                      Pinned messages
                    </Button>
                  </div>
                  {invite && (
                    <Input
                      aria-label="Invite link"
                      readOnly
                      value={invite}
                      onFocus={e => e.currentTarget.select()}
                    />
                  )}
                  <details className="rounded-xl border p-3 text-sm">
                    <summary className="cursor-pointer font-medium">
                      Group & personal settings
                    </summary>
                    <div className="grid gap-4 mt-4">
                      <form
                        className="grid sm:grid-cols-[1fr_180px_auto] gap-2 items-end"
                        onSubmit={e => {
                          e.preventDefault();
                          saveMembership.mutate({
                            threadId: selected,
                            memberTag,
                            notifications: groupNotifications,
                          });
                        }}
                      >
                        <label className="grid gap-1 text-xs">
                          Your member tag
                          <Input
                            aria-label="Your member tag"
                            maxLength={32}
                            value={memberTag}
                            onChange={e => setMemberTag(e.target.value)}
                            placeholder="e.g. Designer"
                          />
                        </label>
                        <label className="grid gap-1 text-xs">
                          Notifications
                          <select
                            aria-label="Group notifications"
                            className="control-select"
                            value={groupNotifications}
                            onChange={e =>
                              setGroupNotifications(
                                e.target.value as
                                  | "all"
                                  | "mentions"
                                  | "muted"
                              )
                            }
                          >
                            <option value="all">All messages</option>
                            <option value="mentions">Mentions only</option>
                            <option value="muted">Muted</option>
                          </select>
                        </label>
                        <Button size="sm" disabled={saveMembership.isPending}>
                          Save my settings
                        </Button>
                      </form>

                      {chosen.ownerId === user?.id && (
                        <form
                          className="grid gap-2 rounded-xl bg-neutral-50 p-3"
                          onSubmit={e => {
                            e.preventDefault();
                            saveThread.mutate({
                              threadId: selected,
                              title: groupTitle,
                              description: groupDescription,
                              handle: groupHandle,
                            });
                          }}
                        >
                          <p className="text-xs font-semibold">
                            Owner group settings
                          </p>
                          <Input
                            aria-label="Group display name"
                            maxLength={80}
                            value={groupTitle}
                            onChange={e => setGroupTitle(e.target.value)}
                          />
                          <Input
                            aria-label="Group description"
                            maxLength={240}
                            value={groupDescription}
                            onChange={e => setGroupDescription(e.target.value)}
                            placeholder="What is this group about?"
                          />
                          <label className="grid gap-1 text-xs">
                            Group mention handle
                            <Input
                              aria-label="Group mention handle"
                              maxLength={40}
                              value={groupHandle}
                              onChange={e =>
                                setGroupHandle(
                                  e.target.value.toLowerCase().replace(
                                    /[^a-z0-9_-]/g,
                                    ""
                                  )
                                )
                              }
                              placeholder="my-group"
                            />
                          </label>
                          <Button
                            className="w-fit"
                            size="sm"
                            disabled={
                              saveThread.isPending ||
                              !groupTitle.trim() ||
                              !/^[a-z0-9][a-z0-9_-]{2,39}$/.test(groupHandle)
                            }
                          >
                            Save group details
                          </Button>
                        </form>
                      )}

                      <div>
                        <p className="text-xs font-semibold mb-2">Members</p>
                        <div className="grid gap-2 sm:grid-cols-2">
                          {details.data?.members.map(person => (
                            <div
                              key={person.userId}
                              className="person-choice"
                            >
                              <span className="min-w-0">
                                <span className="block font-medium truncate">
                                  @{person.username}
                                </span>
                                <span className="block text-xs text-neutral-500 truncate">
                                  {person.memberTag || "Member"}
                                </span>
                              </span>
                              {person.userId !== user?.id && (
                                <Link
                                  className="chip-link shrink-0"
                                  to={`/messages?user=${person.userId}`}
                                >
                                  Message
                                </Link>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </details>
                </header>
                <div
                  key={`${selected}-${history.at(-1) ?? "latest"}-${showPins}`}
                  aria-label="Conversation messages"
                  className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3"
                >
                  {!showPins && (
                    <div
                      className="flex flex-wrap gap-2"
                      aria-label="Message history"
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={
                          messages.isFetching || messages.data?.length !== 50
                        }
                        onClick={() => {
                          const oldest = messages.data?.[0]?.id;
                          if (oldest) setHistory(h => [...h, oldest]);
                        }}
                      >
                        Older messages
                      </Button>
                      {history.length > 0 && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setHistory(h => h.slice(0, -1))}
                          >
                            Newer messages
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setHistory([])}
                          >
                            Latest messages
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                  {displayed.isLoading && (
                    <p role="status" className="text-sm text-neutral-500">
                      Loading messages…
                    </p>
                  )}
                  {!displayed.isError && displayed.data?.length === 0 && (
                    <p className="text-sm text-neutral-500">
                      {showPins
                        ? "No pinned messages visible to you."
                        : "No messages on this page."}
                    </p>
                  )}
                  {displayed.error && (
                    <p role="alert" className="text-sm">
                      Messages unavailable.{" "}
                      <button
                        className="underline"
                        onClick={() => void displayed.refetch()}
                      >
                        Retry
                      </button>
                    </p>
                  )}
                  {!displayed.isError &&
                    displayed.data?.map(m => (
                      <article
                        key={m.id}
                        className={`border rounded-xl p-3 max-w-[95%] min-w-0 [overflow-wrap:anywhere] text-sm ${m.isMine ? "ml-auto bg-neutral-50" : "mr-auto"}`}
                      >
                        <p className="text-xs text-neutral-500 mb-1">
                          {details.data?.members.find(
                            p => p.userId === m.senderId
                          )?.username ?? "Member"}
                          {details.data?.members.find(
                            p => p.userId === m.senderId
                          )?.memberTag
                            ? ` · ${
                                details.data?.members.find(
                                  p => p.userId === m.senderId
                                )?.memberTag
                              }`
                            : ""}
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
                            className="flex flex-wrap gap-2"
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
                            <Button
                              size="sm"
                              disabled={update.isPending || !editText.trim()}
                            >
                              Save
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => setEditing(null)}
                            >
                              Cancel edit
                            </Button>
                          </form>
                        ) : (
                          <p className="whitespace-pre-wrap break-words">
                            <MentionText text={m.text} />
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
                            disabled={
                              !canPublish ||
                              new Date(m.deliverAt).getTime() > Date.now()
                            }
                            onClick={() => setReply(m.id)}
                          >
                            Reply
                          </button>
                          <button
                            className="underline"
                            disabled={
                              update.isPending ||
                              !canPublish ||
                              new Date(m.deliverAt).getTime() > Date.now()
                            }
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
                        {new Date(m.deliverAt).getTime() <= Date.now() && (
                          <MessageReactions
                            key={m.id}
                            id={m.id}
                            mine={m.myReaction}
                            counts={m.reactions}
                          />
                        )}
                      </article>
                    ))}
                </div>
                {canPublish ? (
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
                    <p className="text-[11px] text-neutral-500">
                      Mention a member with @username. Mention this group in a
                      status with{" "}
                      <strong>
                        @group:{details.data?.thread.handle || "group-handle"}
                      </strong>
                      .
                    </p>
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
                          send.isPending ||
                          uploading ||
                          (!text.trim() && !upload)
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
                      {upload && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => setUpload(undefined)}
                        >
                          Remove attachment
                        </Button>
                      )}
                      <label className="text-xs flex flex-wrap items-center gap-2 min-w-0">
                        <span className="whitespace-nowrap">Schedule</span>
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
                        const versionAtUpload = conversationVersion.current;
                        setUploading(true);
                        try {
                          const result = await fileToUpload(f, "chat");
                          if (conversationVersion.current === versionAtUpload)
                            setUpload(result);
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
                ) : (
                  <p className="p-3 border-t text-sm text-neutral-500">
                    Only the channel owner can publish. You can react to
                    delivered messages.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
