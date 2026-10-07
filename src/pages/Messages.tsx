import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { MessageCircle, Reply, Settings2 } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MentionText } from "@/components/MentionText";

export default function Messages() {
  const [params, setParams] = useSearchParams();
  const id = Number(params.get("user"));
  const selected = Number.isSafeInteger(id) && id > 0;
  const utils = trpc.useUtils();
  const conversations = trpc.features.conversations.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const conversation = trpc.features.conversation.useQuery(
    { userId: id },
    { enabled: selected, refetchInterval: 5000 }
  );
  const [text, setText] = useState("");
  const [replyId, setReplyId] = useState<number | undefined>();
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  const refresh = () => {
    void utils.features.conversation.invalidate();
    void utils.features.conversations.invalidate();
  };

  const send = trpc.features.sendMessage.useMutation({
    onSuccess: () => {
      setText("");
      setReplyId(undefined);
      refresh();
    },
  });
  const read = trpc.features.readMessages.useMutation({
    onSuccess: () => void utils.features.conversation.invalidate(),
  });
  const remove = trpc.features.deleteMessage.useMutation({
    onSuccess: refresh,
  });
  const edit = trpc.features.editMessage.useMutation({
    onSuccess: () => {
      setEditing(null);
      setEditText("");
      refresh();
    },
  });

  const markRead = read.mutate;
  const unread =
    conversation.data?.filter(message => !message.isMine && !message.readAt)
      .length || 0;
  useEffect(() => {
    if (selected && unread > 0) markRead({ userId: id });
  }, [id, selected, unread, markRead]);

  useEffect(() => {
    setText("");
    setReplyId(undefined);
    setEditing(null);
    setEditText("");
  }, [id]);

  const peer = conversations.data?.find(p => p.userId === id);
  const replyTarget = conversation.data?.find(m => m.id === replyId);

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto p-4 sm:p-8 page-enter">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Private messages</h1>
            <p className="text-sm text-neutral-500 mt-1">
              Reply, edit and unsend while keeping your own privacy controls.
            </p>
          </div>
          <Link className="chip-link" to="/settings">
            <Settings2 className="w-4 h-4" />
            Message privacy
          </Link>
        </div>

        <div className="grid md:grid-cols-[250px_minmax(0,1fr)] gap-4">
          <aside className="surface-card p-2 max-h-60 md:max-h-[70dvh] overflow-y-auto">
            <p className="text-xs text-neutral-500 px-2 py-3">
              Start a chat from a profile or from a group member list.
            </p>
            {conversations.data?.map(p => (
              <button
                key={p.userId}
                className={`conversation-choice ${
                  p.userId === id ? "conversation-choice-active" : ""
                }`}
                onClick={() => setParams({ user: String(p.userId) })}
              >
                <span className="block text-sm font-medium truncate">
                  @{p.username}
                </span>
                <span className="block text-xs text-neutral-500 truncate">
                  {p.last}
                </span>
              </button>
            ))}
            {!conversations.data?.length && !conversations.isLoading && (
              <p className="p-3 text-sm text-neutral-500">
                No conversations yet.
              </p>
            )}
          </aside>

          <section className="surface-card p-0 overflow-hidden flex flex-col min-w-0 h-[70dvh]">
            {!selected ? (
              <div className="m-auto text-center max-w-xs px-4">
                <MessageCircle className="w-8 h-8 mx-auto mb-3 opacity-60" />
                <p className="text-sm font-medium">Choose a conversation</p>
                <p className="text-xs text-neutral-500 mt-1">
                  Your direct-message permissions are controlled from Settings.
                </p>
              </div>
            ) : (
              <>
                <div className="p-3 border-b flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {peer ? `@${peer.username}` : "Conversation"}
                    </p>
                    <p className="text-[11px] text-neutral-500">
                      You can mention profiles with @username.
                    </p>
                  </div>
                </div>

                <div
                  aria-label="Direct message conversation"
                  className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3"
                >
                  {conversation.isLoading && (
                    <p role="status">Loading messages…</p>
                  )}
                  {conversation.error && (
                    <p role="alert" className="text-sm text-red-600">
                      This conversation is unavailable.
                    </p>
                  )}
                  {conversation.data?.length === 0 && (
                    <p className="text-center text-sm text-neutral-500 py-8">
                      Say hello.
                    </p>
                  )}
                  {conversation.data?.map(m => {
                    const replied = m.replyId
                      ? conversation.data?.find(r => r.id === m.replyId)
                      : undefined;
                    return (
                      <div
                        key={m.id}
                        className={`flex ${
                          m.isMine ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`message-bubble ${
                            m.isMine
                              ? "message-bubble-mine"
                              : "message-bubble-other"
                          }`}
                        >
                          {m.replyId && (
                            <p className="reply-preview">
                              <Reply className="w-3 h-3 shrink-0" />
                              {replied?.text.slice(0, 120) ||
                                "Earlier message unavailable"}
                            </p>
                          )}

                          {editing === m.id ? (
                            <form
                              className="grid gap-2"
                              onSubmit={e => {
                                e.preventDefault();
                                if (editText.trim())
                                  edit.mutate({
                                    id: m.id,
                                    text: editText.trim(),
                                  });
                              }}
                            >
                              <Input
                                aria-label="Edit private message"
                                maxLength={2000}
                                value={editText}
                                onChange={e => setEditText(e.target.value)}
                              />
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  disabled={edit.isPending || !editText.trim()}
                                >
                                  Save edit
                                </Button>
                                <Button
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                  onClick={() => setEditing(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </form>
                          ) : (
                            <p className="whitespace-pre-wrap break-words">
                              <MentionText text={m.text} />
                            </p>
                          )}

                          <div className="flex flex-wrap gap-2 items-center mt-2 text-[10px] opacity-70">
                            <span>
                              {m.editedAt ? "Edited · " : ""}
                              {m.isMine && m.readAt
                                ? "Read"
                                : new Date(m.createdAt).toLocaleTimeString([], {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                            </span>
                            <button
                              className="underline"
                              onClick={() => setReplyId(m.id)}
                            >
                              Reply
                            </button>
                            {m.isMine && (
                              <>
                                <button
                                  className="underline"
                                  onClick={() => {
                                    setEditing(m.id);
                                    setEditText(m.text);
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  disabled={remove.isPending}
                                  onClick={() => remove.mutate({ id: m.id })}
                                  className="underline"
                                  aria-label="Unsend message"
                                >
                                  Unsend
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <form
                  className="p-3 border-t space-y-2"
                  onSubmit={e => {
                    e.preventDefault();
                    if (text.trim() && !send.isPending)
                      send.mutate({
                        userId: id,
                        text: text.trim(),
                        replyId,
                      });
                  }}
                >
                  {replyTarget && (
                    <div className="reply-compose">
                      <span className="min-w-0 truncate">
                        Replying to: {replyTarget.text}
                      </span>
                      <button
                        type="button"
                        className="underline shrink-0"
                        onClick={() => setReplyId(undefined)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      aria-label="Message"
                      placeholder="Message…"
                      maxLength={2000}
                      className="flex-1 min-w-0"
                      value={text}
                      onChange={e => setText(e.target.value)}
                    />
                    <Button
                      size="sm"
                      disabled={
                        !text.trim() || send.isPending || !!conversation.error
                      }
                      type="submit"
                    >
                      Send
                    </Button>
                  </div>
                </form>
                {send.error && (
                  <p role="alert" className="text-xs text-red-600 px-3 pb-3">
                    {send.error.message}
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
