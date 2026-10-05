import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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
  const send = trpc.features.sendMessage.useMutation({
    onSuccess: () => {
      setText("");
      utils.features.conversation.invalidate();
      utils.features.conversations.invalidate();
    },
  });
  const read = trpc.features.readMessages.useMutation({
    onSuccess: () => utils.features.conversation.invalidate(),
  });
  const remove = trpc.features.deleteMessage.useMutation({
    onSuccess: () => utils.features.conversation.invalidate(),
  });
  const markRead = read.mutate;
  const unread =
    conversation.data?.filter(message => !message.isMine && !message.readAt)
      .length || 0;
  useEffect(() => {
    if (selected && unread > 0) markRead({ userId: id });
  }, [id, selected, unread, markRead]);
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4 sm:p-8">
        <h1 className="text-xl font-semibold mb-6">Messages</h1>
        <div className="grid md:grid-cols-[220px_minmax(0,1fr)] gap-4">
          <aside className="border rounded-xl p-2 max-h-60 md:max-h-[70dvh] overflow-y-auto">
            <p className="text-xs text-neutral-500 px-2 py-3">
              Start a conversation from a profile. People must follow you to
              receive your messages.
            </p>
            {conversations.data?.map(p => (
              <button
                key={p.userId}
                className={`w-full text-left p-3 rounded-lg ${p.userId === id ? "bg-neutral-100" : "hover:bg-neutral-50"}`}
                onClick={() => {
                  setText("");
                  setParams({ user: String(p.userId) });
                }}
              >
                <p className="text-sm font-medium truncate">{p.username}</p>
                <p className="text-xs text-neutral-500 truncate">{p.last}</p>
              </button>
            ))}
          </aside>
          <section className="border rounded-xl flex flex-col min-w-0 h-[65dvh]">
            {!selected ? (
              <p className="m-auto text-sm text-neutral-500">
                Choose a conversation.
              </p>
            ) : (
              <>
                <div className="p-3 border-b text-sm font-medium">
                  Conversation
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
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
                  {conversation.data?.map(m => (
                    <div
                      key={m.id}
                      className={`flex ${m.isMine ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-sm break-words ${m.isMine ? "bg-neutral-900 text-white" : "bg-neutral-100"}`}
                      >
                        <p className="whitespace-pre-wrap">{m.text}</p>
                        <div className="flex gap-2 items-center mt-1 text-[10px] opacity-70">
                          <span>
                            {m.isMine && m.readAt
                              ? "Read"
                              : new Date(m.createdAt).toLocaleTimeString([], {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                          </span>
                          {m.isMine && (
                            <button
                              disabled={remove.isPending}
                              onClick={() => remove.mutate({ id: m.id })}
                              className="underline"
                              aria-label="Unsend message"
                            >
                              Unsend
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <form
                  className="flex items-center gap-2 p-3 border-t"
                  onSubmit={e => {
                    e.preventDefault();
                    if (text.trim() && !send.isPending)
                      send.mutate({ userId: id, text: text.trim() });
                  }}
                >
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
