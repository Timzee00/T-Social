import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { naira } from "./Wallet";
export default function WalletAdmin() {
  const utils = trpc.useUtils(),
    q = trpc.wallet.operations.useQuery(),
    audit = trpc.wallet.audit.useQuery();
  const refresh = () => void utils.wallet.invalidate();
  const [fundAmount, setFund] = useState("10000"),
    [title, setTitle] = useState("Welcome reward"),
    [reward, setReward] = useState("100"),
    [budget, setBudget] = useState("1000"),
    [task, setTask] = useState<"signup" | "profile" | "first_post">("signup"),
    [ref, setRef] = useState(""),
    [user, setUser] = useState(""),
    [kyc, setKyc] = useState(""),
    [recipient, setRecipient] = useState("");
  const fund = trpc.wallet.fund.useMutation({
      onSuccess: r => window.location.assign(r.url),
    }),
    verifyFund = trpc.wallet.verifyFunding.useMutation({ onSuccess: refresh }),
    campaign = trpc.wallet.createCampaign.useMutation({ onSuccess: refresh }),
    verify = trpc.wallet.verifyIdentity.useMutation({ onSuccess: refresh }),
    process = trpc.wallet.processWithdrawal.useMutation({ onSuccess: refresh }),
    reconcile = trpc.wallet.reconcile.useMutation({ onSuccess: refresh });
  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto p-4 sm:p-8 space-y-5">
        <h1 className="text-xl font-semibold">Wallet operations</h1>
        {q.error ? (
          <p role="alert">Administrator access required.</p>
        ) : (
          <>
            <p className="text-sm text-neutral-500">
              Verify identity through your approved provider before recording a
              review reference. Check provider liquidity and fees before
              approving payouts. Never approve an account solely because its
              bank recipient exists.
            </p>
            <section className="border rounded-xl p-4 space-y-3">
              <h2 className="font-semibold">Fund reward treasury</h2>
              <form
                className="flex gap-2 flex-wrap"
                onSubmit={e => {
                  e.preventDefault();
                  fund.mutate({ amount: Number(fundAmount) * 100 });
                }}
              >
                <Input
                  aria-label="Funding amount in naira"
                  className="w-44"
                  type="number"
                  min={100}
                  max={1000000}
                  value={fundAmount}
                  onChange={e => setFund(e.target.value)}
                />
                <Button size="sm" disabled={fund.isPending}>
                  Pay with Paystack
                </Button>
              </form>
              <form
                className="flex gap-2 flex-wrap"
                onSubmit={e => {
                  e.preventDefault();
                  verifyFund.mutate({ reference: ref });
                }}
              >
                <Input
                  aria-label="Funding reference"
                  className="flex-1 min-w-0"
                  placeholder="tsf_ reference"
                  value={ref}
                  onChange={e => setRef(e.target.value)}
                />
                <Button size="sm" disabled={verifyFund.isPending}>
                  Verify funding
                </Button>
              </form>
            </section>
            <section className="border rounded-xl p-4 space-y-3">
              <h2 className="font-semibold">Allocate a funded campaign</h2>
              <form
                className="space-y-2"
                onSubmit={e => {
                  e.preventDefault();
                  campaign.mutate({
                    title,
                    task,
                    amount: Number(reward) * 100,
                    budget: Number(budget) * 100,
                    expiresAt: new Date(Date.now() + 7 * 86400000),
                  });
                }}
              >
                <Input
                  aria-label="Campaign title"
                  maxLength={80}
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
                <div className="flex gap-2 flex-wrap">
                  <select
                    aria-label="Reward task"
                    className="border rounded-md text-sm p-2"
                    value={task}
                    onChange={e => setTask(e.target.value as typeof task)}
                  >
                    <option value="signup">Verified signup</option>
                    <option value="profile">Complete profile</option>
                    <option value="first_post">First post</option>
                  </select>
                  <label className="text-xs">
                    Reward (NGN)
                    <Input
                      aria-label="Cash reward in naira"
                      type="number"
                      className="w-32"
                      min={1}
                      max={1000}
                      value={reward}
                      onChange={e => setReward(e.target.value)}
                    />
                  </label>
                  <label className="text-xs">
                    Budget (NGN)
                    <Input
                      aria-label="Campaign budget in naira"
                      type="number"
                      className="w-32"
                      min={1}
                      value={budget}
                      onChange={e => setBudget(e.target.value)}
                    />
                  </label>
                </div>
                <Button size="sm" disabled={campaign.isPending}>
                  Allocate for 7 days
                </Button>
              </form>
            </section>
            <section className="border rounded-xl p-4 space-y-3">
              <h2 className="font-semibold">Record verified identity review</h2>
              <form
                className="space-y-2"
                onSubmit={e => {
                  e.preventDefault();
                  verify.mutate({
                    userId: Number(user),
                    verificationReference: kyc,
                    recipientCode: recipient,
                  });
                }}
              >
                <Input
                  aria-label="Verified user ID"
                  placeholder="User ID"
                  type="number"
                  value={user}
                  onChange={e => setUser(e.target.value)}
                />
                <Input
                  aria-label="Identity provider review reference"
                  placeholder="Identity provider review reference"
                  maxLength={120}
                  value={kyc}
                  onChange={e => setKyc(e.target.value)}
                />
                <Input
                  aria-label="Paystack recipient code"
                  placeholder="RCP_ recipient code"
                  value={recipient}
                  onChange={e => setRecipient(e.target.value)}
                />
                <Button size="sm" disabled={verify.isPending}>
                  Record approval
                </Button>
              </form>
            </section>
            <section>
              <h2 className="font-semibold">Withdrawals</h2>
              {q.data?.payouts.map(p => (
                <div
                  key={p.id}
                  className="border rounded-lg p-3 my-2 space-y-2"
                >
                  <p className="text-sm">
                    User {p.userId} · {naira(p.amount)} · {p.status}
                  </p>
                  <p className="text-xs break-all">{p.reference}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={p.status !== "reserved" || process.isPending}
                      onClick={() => process.mutate({ id: p.id })}
                    >
                      Submit payout
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={reconcile.isPending}
                      onClick={() =>
                        reconcile.mutate({ reference: p.reference })
                      }
                    >
                      Reconcile
                    </Button>
                  </div>
                </div>
              ))}
            </section>
            <section className="border rounded-lg p-3 text-sm">
              Ledger audit:{" "}
              {audit.data
                ? `${audit.data.accountsChecked} accounts, ${audit.data.journalsChecked} journals; ${audit.data.mismatches.length + audit.data.unbalanced.length} inconsistencies`
                : "loading"}
            </section>
            <section>
              <h2 className="font-semibold mb-2">Security events</h2>
              {q.data?.events.map(e => (
                <p className="text-xs py-1 break-words" key={e.id}>
                  {e.event} · {new Date(e.createdAt).toLocaleString()}
                </p>
              ))}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
