import { useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
export default function Studio() {
  const utils = trpc.useUtils(),
    q = trpc.community.creator.useQuery(),
    drafts = trpc.community.drafts.useQuery();
  const [caption, setCaption] = useState("");
  const save = trpc.community.saveDraft.useMutation({
      onSuccess: () => {
        setCaption("");
        void utils.community.drafts.invalidate();
      },
    }),
    remove = trpc.community.deleteDraft.useMutation({
      onSuccess: () => void utils.community.drafts.invalidate(),
    });
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-6">
        <h1 className="text-xl font-semibold">Creator studio</h1>
        <p className="text-sm text-neutral-500">
          Gifts and supporter memberships use T Coins. T Coins have no cash
          value. Cash earnings are shown separately in your{" "}
          <Link to="/wallet" className="underline">
            wallet
          </Link>
          .
        </p>
        <section className="grid sm:grid-cols-3 gap-3">
          {[
            {
              title: "Active supporters",
              value: q.data?.subscribers.length ?? 0,
            },
            {
              title: "Gift coins received (recent 100)",
              value: q.data?.gifts.reduce((n, g) => n + g.amount, 0) ?? 0,
            },
            { title: "Posts (recent 100)", value: q.data?.posts.length ?? 0 },
          ].map(p => (
            <div className="border rounded-xl p-4" key={p.title}>
              <p className="text-xs text-neutral-500">{p.title}</p>
              <p className="text-2xl font-semibold mt-2">{p.value}</p>
            </div>
          ))}
        </section>
        {q.error && <p role="alert">Analytics could not load.</p>}
        <section>
          <h2 className="font-semibold mb-3">Post performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr>
                  {["Post", "Likes", "Comments", "Saves", "Reposts"].map(h => (
                    <th key={h} className="p-2 border-b">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {q.data?.posts.map(p => (
                  <tr key={p.id}>
                    <td className="p-2 border-b max-w-48">
                      <Link
                        className="line-clamp-2 underline break-words"
                        to={`/post/${p.id}`}
                      >
                        {p.caption || "Untitled post"}
                      </Link>
                    </td>
                    {[p.likes, p.comments, p.saves, p.reposts].map((n, i) => (
                      <td key={i} className="p-2 border-b">
                        {Number(n)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="space-y-3">
          <h2 className="font-semibold">Caption drafts</h2>
          <form
            className="space-y-2"
            onSubmit={e => {
              e.preventDefault();
              save.mutate({ caption });
            }}
          >
            <textarea
              aria-label="Draft caption"
              className="border rounded-lg p-3 w-full text-sm min-h-28"
              maxLength={2200}
              value={caption}
              onChange={e => setCaption(e.target.value)}
              placeholder="Keep an idea for your next post"
            />
            <Button size="sm" disabled={!caption.trim() || save.isPending}>
              Save draft
            </Button>
          </form>
          {drafts.data?.map(d => (
            <div className="border rounded-lg p-3 space-y-2" key={d.id}>
              <p className="text-sm whitespace-pre-wrap break-words">
                {d.caption}
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setCaption(d.caption)}
              >
                Use in editor
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ id: d.id })}
              >
                Delete
              </Button>
            </div>
          ))}
        </section>
        <section>
          <h2 className="font-semibold mb-2">Active supporters</h2>
          {q.data?.subscribers.map(s => (
            <p className="text-sm py-1" key={s.id}>
              {s.username} · through{" "}
              {new Date(s.expiresAt).toLocaleDateString()}
            </p>
          ))}
        </section>
        <Link to="/groups" className="text-sm underline">
          Create a broadcast channel
        </Link>
      </div>
    </AppLayout>
  );
}
