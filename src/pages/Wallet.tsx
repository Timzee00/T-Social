import { useRef, useState } from "react";
import { Link } from "react-router";
import { trpc } from "@/providers/trpc";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export const naira = (kobo: number) =>
  new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(
    kobo / 100
  );
export default function Wallet() {
  const { user } = useAuth();
  const utils = trpc.useUtils();
  const summary = trpc.wallet.summary.useQuery(),
    tasks = trpc.wallet.tasks.useQuery(),
    campaigns = trpc.wallet.campaigns.useQuery();
  const refresh = () => {
    void utils.wallet.invalidate();
  };
  const claim = trpc.wallet.claim.useMutation({ onSuccess: refresh }),
    cash = trpc.wallet.claimCash.useMutation({ onSuccess: refresh });
  const [pin, setPin] = useState(""),
    [oldPin, setOldPin] = useState(""),
    [amount, setAmount] = useState(""),
    [withdrawPin, setWithdrawPin] = useState("");
  const key = useRef(crypto.randomUUID());
  const setWalletPin = trpc.wallet.setPin.useMutation({
    onSuccess: () => {
      setPin("");
      setOldPin("");
      refresh();
    },
  });
  const withdraw = trpc.wallet.withdraw.useMutation({
    onSuccess: () => {
      key.current = crypto.randomUUID();
      setWithdrawPin("");
      setAmount("");
      refresh();
    },
  });
  const balance = summary.data;
  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Your wallet</h1>
          {user?.role === "admin" && (
            <Link className="text-sm underline" to="/wallet/admin">
              Operations
            </Link>
          )}
        </div>
        {summary.isLoading && <p role="status">Loading wallet…</p>}
        {summary.error && (
          <p role="alert">
            Wallet unavailable.{" "}
            <button
              className="underline"
              onClick={() => void summary.refetch()}
            >
              Try again
            </button>
          </p>
        )}
        {balance && (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <section className="border rounded-xl p-5">
                <p className="text-sm text-neutral-500">T Coins</p>
                <p className="text-3xl font-semibold my-2">
                  {balance.coins.toLocaleString()}
                </p>
                <p className="text-xs text-neutral-500">
                  Virtual credits for creator gifts and supporter memberships.
                  No cash value.
                </p>
              </section>
              <section className="border rounded-xl p-5">
                <p className="text-sm text-neutral-500">Funded earnings</p>
                <p className="text-3xl font-semibold my-2">
                  {naira(balance.cashKobo)}
                </p>
                <p className="text-xs text-neutral-500">
                  Only approved, funded rewards can be withdrawn.
                </p>
              </section>
            </div>
            {balance.testMode && (
              <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm">
                Payment sandbox: these are test transactions, not real money.
              </p>
            )}
            {balance.frozen && (
              <p role="alert" className="text-red-600 text-sm">
                Your wallet is under review. Transfers are paused.
              </p>
            )}
            <section className="space-y-3">
              <h2 className="font-semibold">Earn T Coins</h2>
              <p className="text-sm text-neutral-500">
                Each task pays once. Likes, views and repeated signups do not
                earn cash.
              </p>
              {tasks.data?.map(t => (
                <div
                  key={t.id}
                  className="border rounded-lg p-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-neutral-500">
                      {t.coins} T Coins
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
              ))}
            </section>
            <section className="space-y-3">
              <h2 className="font-semibold">Funded campaigns</h2>
              {!balance.cashEnabled && (
                <p className="text-sm text-neutral-500">
                  Cash rewards and withdrawals are paused until payment and
                  identity services are ready. No cash signup bonus is promised.
                </p>
              )}
              {campaigns.data?.map(c => (
                <div
                  key={c.id}
                  className="border rounded-lg p-3 flex justify-between items-center gap-3"
                >
                  <div>
                    <p className="text-sm font-medium break-words">{c.title}</p>
                    <p className="text-xs text-neutral-500">
                      {naira(c.amount)} · {c.task.replaceAll("_", " ")} · while
                      budget remains
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={
                      !balance.cashEnabled ||
                      !balance.verified ||
                      cash.isPending ||
                      balance.frozen
                    }
                    onClick={() => cash.mutate({ campaignId: c.id })}
                  >
                    Claim
                  </Button>
                </div>
              ))}
              {campaigns.data?.length === 0 && (
                <p className="text-sm text-neutral-500">
                  No funded campaigns are available.
                </p>
              )}
            </section>
            <section className="border rounded-xl p-4 space-y-3">
              <h2 className="font-semibold">Wallet security</h2>
              <p className="text-sm text-neutral-500">
                Identity:{" "}
                {balance.verified
                  ? "reviewed"
                  : "verification required before cash rewards"}
                .{" "}
                {balance.recipientLabel &&
                  `Payout account: ${balance.recipientLabel}.`}{" "}
                Sign in again before changing your PIN or requesting a
                withdrawal.
              </p>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={e => {
                  e.preventDefault();
                  setWalletPin.mutate({ pin, currentPin: oldPin || undefined });
                }}
              >
                {balance.hasPin && (
                  <Input
                    className="w-40"
                    aria-label="Current wallet PIN"
                    type="password"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="off"
                    placeholder="Current PIN"
                    value={oldPin}
                    onChange={e => setOldPin(e.target.value)}
                  />
                )}
                <Input
                  className="w-40"
                  aria-label="New wallet PIN"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="new-password"
                  placeholder="New 6-digit PIN"
                  value={pin}
                  onChange={e => setPin(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={!/^\d{6}$/.test(pin) || setWalletPin.isPending}
                >
                  Save PIN
                </Button>
              </form>
              <form
                className="flex flex-wrap gap-2"
                onSubmit={e => {
                  e.preventDefault();
                  if (/^\d{1,5}(\.\d{1,2})?$/.test(amount)) {
                    const [whole, fraction = ""] = amount.split(".");
                    withdraw.mutate({
                      amount:
                        Number(whole) * 100 + Number(fraction.padEnd(2, "0")),
                      pin: withdrawPin,
                      requestKey: key.current,
                    });
                  }
                }}
              >
                <Input
                  className="w-40"
                  aria-label="Withdrawal amount in naira"
                  inputMode="decimal"
                  placeholder="Naira · min 500"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
                <Input
                  className="w-40"
                  aria-label="Withdrawal PIN"
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="off"
                  placeholder="Wallet PIN"
                  value={withdrawPin}
                  onChange={e => setWithdrawPin(e.target.value)}
                />
                <Button
                  size="sm"
                  disabled={
                    !balance.cashEnabled ||
                    !balance.verified ||
                    !balance.hasPin ||
                    balance.frozen ||
                    withdraw.isPending ||
                    !/^\d{6}$/.test(withdrawPin) ||
                    !/^\d{1,5}(\.\d{1,2})?$/.test(amount)
                  }
                >
                  Request withdrawal
                </Button>
              </form>
              <p className="text-xs text-neutral-500">
                Cash is reserved when requested. An operator reviews the payout.
                Provider fees and settlement delays may apply.
              </p>
            </section>
            <section>
              <h2 className="font-semibold mb-3">Activity</h2>
              {balance.history.length === 0 && (
                <p className="text-sm text-neutral-500">
                  Your rewards and transfers will appear here.
                </p>
              )}
              <div className="divide-y">
                {balance.history.map(h => (
                  <div
                    key={h.id}
                    className="flex justify-between gap-3 py-3 text-sm"
                  >
                    <div className="min-w-0">
                      <p className="break-words">{h.description}</p>
                      <p className="text-xs text-neutral-500">
                        {new Date(h.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <span className="shrink-0">
                      {h.amount > 0 ? "+" : ""}
                      {h.currency === "NGN"
                        ? naira(h.amount)
                        : `${h.amount} coins`}
                    </span>
                  </div>
                ))}
              </div>
              {balance.payouts.map(p => (
                <p key={p.id} className="text-sm py-2">
                  Withdrawal {naira(p.amount)} · {p.status}
                </p>
              ))}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
