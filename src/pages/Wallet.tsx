import { useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { Coins, Send, Sparkles, ShieldCheck } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Wallet() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const summary = trpc.wallet.summary.useQuery();
  const tasks = trpc.wallet.tasks.useQuery();
  const [search, setSearch] = useState("");
  const [recipient, setRecipient] = useState<{
    userId: number;
    username: string;
  } | null>(null);
  const [amount, setAmount] = useState("");
  const requestKey = useRef(crypto.randomUUID());

  const people = trpc.social.searchUsers.useQuery(
    { q: search.trim() },
    { enabled: search.trim().length > 0 }
  );
  const refresh = () => void utils.wallet.invalidate();
  const claim = trpc.wallet.claim.useMutation({ onSuccess: refresh });
  const send = trpc.wallet.sendCoins.useMutation({
    onSuccess: () => {
      requestKey.current = crypto.randomUUID();
      setAmount("");
      setSearch("");
      setRecipient(null);
      refresh();
    },
  });

  const balance = summary.data;
  const amountNumber = useMemo(() => Number(amount), [amount]);

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-6 page-enter">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">T Coin wallet</h1>
            <p className="text-sm text-neutral-500 mt-1">
              A virtual social balance for gifts, supporter memberships and
              peer-to-peer fun inside T Social.
            </p>
          </div>
          {user?.role === "admin" && (
            <Link className="chip-link" to="/wallet/admin">
              Virtual coin controls
            </Link>
          )}
        </div>

        <section className="wallet-hero">
          <div>
            <p className="text-sm opacity-75">Available balance</p>
            <p className="text-4xl sm:text-5xl font-black tracking-tight my-2">
              {balance?.coins.toLocaleString() ?? "—"}
            </p>
            <p className="text-sm font-medium">T Coins</p>
          </div>
          <Coins className="w-12 h-12 opacity-70" aria-hidden="true" />
        </section>

        <div className="surface-card flex gap-3 items-start">
          <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Virtual only — no real money</p>
            <p className="text-sm text-neutral-500 mt-1">
              T Coins have no cash value. They cannot be deposited, withdrawn,
              exchanged for naira or converted into any real-world currency.
            </p>
          </div>
        </div>

        {summary.isLoading && <p role="status">Loading wallet…</p>}
        {summary.error && (
          <p role="alert" className="surface-card">
            Wallet unavailable.{" "}
            <button
              className="underline"
              onClick={() => void summary.refetch()}
            >
              Try again
            </button>
          </p>
        )}

        {balance?.frozen && (
          <p role="alert" className="surface-card text-red-600 text-sm">
            Your virtual wallet is temporarily restricted.
          </p>
        )}

        <section className="space-y-3">
          <div className="flex gap-2 items-center">
            <Sparkles className="w-5 h-5" />
            <h2 className="font-semibold">Earn T Coins</h2>
          </div>
          <p className="text-sm text-neutral-500">
            Each task pays once. Rewards stay entirely inside T Social.
          </p>
          <div className="grid sm:grid-cols-2 gap-3">
            {tasks.data?.map(t => (
              <div key={t.id} className="surface-card interactive-lift">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-neutral-500 mt-1">
                      +{t.coins} T Coins
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={t.claimed || !t.eligible || claim.isPending}
                    onClick={() => claim.mutate({ task: t.id })}
                  >
                    {t.claimed
                      ? "Claimed"
                      : t.eligible
                        ? "Claim"
                        : "Complete task"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="surface-card space-y-4">
          <div className="flex items-center gap-2">
            <Send className="w-5 h-5" />
            <div>
              <h2 className="font-semibold">Send T Coins</h2>
              <p className="text-xs text-neutral-500">
                Transfer virtual coins to another T Social member.
              </p>
            </div>
          </div>

          {!recipient ? (
            <>
              <Input
                aria-label="Find T Coin recipient"
                maxLength={50}
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search username"
              />
              <div className="grid gap-2">
                {people.data
                  ?.filter(p => p.userId !== user?.id)
                  .map(p => (
                    <button
                      type="button"
                      key={p.userId}
                      className="person-choice"
                      onClick={() =>
                        setRecipient({
                          userId: p.userId,
                          username: p.username,
                        })
                      }
                    >
                      <span className="font-medium">@{p.username}</span>
                      <span className="text-xs text-neutral-500">Choose</span>
                    </button>
                  ))}
              </div>
            </>
          ) : (
            <form
              className="grid gap-3"
              onSubmit={e => {
                e.preventDefault();
                if (
                  Number.isSafeInteger(amountNumber) &&
                  amountNumber > 0 &&
                  !send.isPending
                )
                  send.mutate({
                    userId: recipient.userId,
                    amount: amountNumber,
                    requestKey: requestKey.current,
                  });
              }}
            >
              <div className="flex items-center justify-between gap-3 rounded-xl border p-3">
                <span className="text-sm">
                  Sending to <strong>@{recipient.username}</strong>
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setRecipient(null)}
                >
                  Change
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                <Input
                  aria-label="T Coin amount"
                  className="max-w-48"
                  type="number"
                  min={1}
                  max={100000}
                  step={1}
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="Amount"
                />
                <Button
                  disabled={
                    send.isPending ||
                    !Number.isSafeInteger(amountNumber) ||
                    amountNumber < 1
                  }
                >
                  Send T Coins
                </Button>
              </div>
              {send.error && (
                <p role="alert" className="text-sm text-red-600">
                  {send.error.message}
                </p>
              )}
            </form>
          )}
        </section>

        <section>
          <h2 className="font-semibold mb-3">Virtual coin activity</h2>
          {!balance?.history.length && (
            <p className="text-sm text-neutral-500">
              Your T Coin rewards and transfers will appear here.
            </p>
          )}
          <div className="grid gap-2">
            {balance?.history.map(h => (
              <div
                key={h.id}
                className="surface-card flex justify-between items-center gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm break-words">{h.description}</p>
                  <p className="text-xs text-neutral-500">
                    {new Date(h.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <span className="font-semibold shrink-0">
                  {h.amount > 0 ? "+" : ""}
                  {h.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppLayout>
  );
}
