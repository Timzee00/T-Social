import { useRef, useState } from "react";
import { Coins, ShieldCheck } from "lucide-react";
import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function WalletAdmin() {
  const utils = trpc.useUtils();
  const summary = trpc.wallet.adminSummary.useQuery();
  const audit = trpc.wallet.audit.useQuery();
  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const requestKey = useRef(crypto.randomUUID());
  const grant = trpc.wallet.grantCoins.useMutation({
    onSuccess: () => {
      requestKey.current = crypto.randomUUID();
      setUserId("");
      setAmount("");
      setReason("");
      void utils.wallet.invalidate();
    },
  });

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-6 page-enter">
        <div>
          <h1 className="text-2xl font-semibold">Virtual coin controls</h1>
          <p className="text-sm text-neutral-500 mt-1">
            Administrative controls for T Coins only. No deposits, bank
            accounts, payment processors or withdrawals exist on this surface.
          </p>
        </div>

        {summary.error ? (
          <p role="alert" className="surface-card">
            Administrator access required.
          </p>
        ) : (
          <>
            <div className="grid sm:grid-cols-2 gap-3">
              <section className="surface-card interactive-lift">
                <Coins className="w-5 h-5 mb-3" />
                <p className="text-xs text-neutral-500">Virtual coin accounts</p>
                <p className="text-3xl font-bold mt-1">
                  {summary.data?.coinAccounts.toLocaleString() ?? "—"}
                </p>
              </section>
              <section className="surface-card interactive-lift">
                <ShieldCheck className="w-5 h-5 mb-3" />
                <p className="text-xs text-neutral-500">
                  Positive T Coin balances
                </p>
                <p className="text-3xl font-bold mt-1">
                  {summary.data?.circulatingCoins.toLocaleString() ?? "—"}
                </p>
              </section>
            </div>

            <section className="surface-card space-y-4">
              <div>
                <h2 className="font-semibold">Grant virtual T Coins</h2>
                <p className="text-xs text-neutral-500 mt-1">
                  Every grant is recorded in the ledger with an idempotent
                  request key and a reason.
                </p>
              </div>
              <form
                className="grid gap-3"
                onSubmit={e => {
                  e.preventDefault();
                  const uid = Number(userId);
                  const coins = Number(amount);
                  if (
                    Number.isSafeInteger(uid) &&
                    uid > 0 &&
                    Number.isSafeInteger(coins) &&
                    coins > 0
                  )
                    grant.mutate({
                      userId: uid,
                      amount: coins,
                      reason,
                      requestKey: requestKey.current,
                    });
                }}
              >
                <div className="grid sm:grid-cols-2 gap-3">
                  <Input
                    aria-label="User ID"
                    type="number"
                    min={1}
                    value={userId}
                    onChange={e => setUserId(e.target.value)}
                    placeholder="User ID"
                  />
                  <Input
                    aria-label="Virtual T Coin amount"
                    type="number"
                    min={1}
                    max={1000000}
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="T Coins"
                  />
                </div>
                <Input
                  aria-label="Grant reason"
                  maxLength={120}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Reason for this virtual coin grant"
                />
                <Button
                  disabled={
                    grant.isPending ||
                    reason.trim().length < 3 ||
                    !Number.isSafeInteger(Number(userId)) ||
                    Number(userId) < 1 ||
                    !Number.isSafeInteger(Number(amount)) ||
                    Number(amount) < 1
                  }
                >
                  Grant T Coins
                </Button>
                {grant.error && (
                  <p role="alert" className="text-sm text-red-600">
                    {grant.error.message}
                  </p>
                )}
              </form>
            </section>

            <section className="surface-card text-sm">
              <h2 className="font-semibold mb-2">Ledger integrity</h2>
              {audit.data
                ? `${audit.data.accountsChecked} coin accounts and ${audit.data.journalsChecked} coin journals checked; ${
                    audit.data.mismatches.length + audit.data.unbalanced.length
                  } inconsistencies.`
                : "Checking virtual coin ledger…"}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
