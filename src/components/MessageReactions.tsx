import { useState } from "react";
import { trpc } from "@/providers/trpc";

const reactions = [
  ["❤️", "Love"],
  ["👏", "Applause"],
  ["😂", "Laugh"],
  ["😮", "Surprised"],
  ["😢", "Sad"],
  ["🔥", "Fire"],
] as const;

export function MessageReactions({
  id,
  mine,
  counts,
}: {
  id: number;
  mine: string | null;
  counts: { reaction: string }[];
}) {
  const [open, setOpen] = useState(false);
  const utils = trpc.useUtils();
  const react = trpc.chat.react.useMutation({
    onSuccess: () => {
      void utils.chat.messages.invalidate();
    },
  });
  return (
    <div className="mt-2 space-y-2">
      <button
        type="button"
        className="text-xs underline py-1"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        React to message
      </button>
      <div
        className="flex flex-wrap gap-1"
        role="group"
        aria-label="Message reactions"
      >
        {reactions.map(([emoji, name]) => {
          const count = counts.filter(r => r.reaction === emoji).length;
          return (
            (open || count > 0) && (
              <button
                key={emoji}
                type="button"
                aria-label={`${name} reaction${count ? `, ${count}` : ""}`}
                aria-pressed={mine === emoji}
                disabled={react.isPending}
                className={`min-h-9 min-w-9 px-2 rounded-lg border text-sm ${mine === emoji ? "border-neutral-600 bg-neutral-100" : "border-neutral-200"}`}
                onClick={() =>
                  react.mutate({ id, reaction: emoji, remove: mine === emoji })
                }
              >
                {emoji}
                {count > 0 && <span className="ml-1 text-xs">{count}</span>}
              </button>
            )
          );
        })}
      </div>
    </div>
  );
}
