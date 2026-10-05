import { useEffect, useState } from "react";
import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
export default function Settings() {
  const utils = trpc.useUtils();
  const { refresh } = useAuth();
  const profile = trpc.social.myProfile.useQuery();
  const sessions = trpc.auth.sessions.useQuery();
  const identities = trpc.auth.identities.useQuery();
  const requests = trpc.features.followRequests.useQuery();
  const blocked = trpc.features.blocked.useQuery();
  const insights = trpc.features.insights.useQuery();
  const [providers, setProviders] = useState<string[]>([]),
    [linkError, setLinkError] = useState("");
  useEffect(() => {
    fetch("/api/auth/providers")
      .then(r => r.json())
      .then(data => setProviders(data.providers || []))
      .catch(() => setLinkError("Sign-in options could not be loaded"));
  }, []);
  const [privacyDraft, setPrivacyDraft] = useState<boolean | null>(null);
  const privacy = trpc.features.privacy.useMutation({
    onSuccess: async () => {
      await utils.invalidate();
      setPrivacyDraft(null);
    },
    onError: () => setPrivacyDraft(null),
  });
  const revoke = trpc.auth.revokeSession.useMutation({
    onSuccess: async () => {
      await utils.auth.sessions.invalidate();
      await refresh();
    },
  });
  const others = trpc.auth.logoutOthers.useMutation({
    onSuccess: () => utils.auth.sessions.invalidate(),
  });
  const respond = trpc.features.respondRequest.useMutation({
    onSuccess: () => utils.features.followRequests.invalidate(),
  });
  const block = trpc.features.block.useMutation({
    onSuccess: () => utils.invalidate(),
  });
  const exported = trpc.features.exportData.useMutation({
    onSuccess: data => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "t-social-data.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });
  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto p-4 sm:p-8 space-y-6">
        <h1 className="text-2xl font-semibold">Settings & security</h1>
        <section className="border rounded-xl p-4 space-y-3">
          <h2 className="font-medium">Account privacy</h2>
          <label className="flex items-start gap-3 text-sm">
            <input
              type="checkbox"
              className="mt-1"
              checked={privacyDraft ?? profile.data?.isPrivate ?? false}
              disabled={
                !profile.data || privacy.isPending || privacyDraft !== null
              }
              onChange={e => {
                setPrivacyDraft(e.target.checked);
                privacy.mutate({ isPrivate: e.target.checked });
              }}
            />
            <span>
              Private account
              <span className="block text-neutral-500 mt-1">
                Only approved followers can see your posts and Stories.
                Switching to public accepts pending requests.
              </span>
            </span>
          </label>
        </section>
        <section className="border rounded-xl p-4 space-y-3">
          <h2 className="font-medium">Sign-in methods</h2>
          <p className="text-sm text-neutral-500">
            Connected:{" "}
            {identities.data?.map(x => x.provider).join(", ") || "Loading…"}
          </p>
          <p className="text-xs text-neutral-500">
            Sign in again before linking another provider. Matching email
            addresses do not merge accounts.
          </p>
          <div className="flex flex-wrap gap-2">
            {providers
              .filter(p => !identities.data?.some(i => i.provider === p))
              .map(p => (
                <Button
                  key={p}
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    setLinkError("");
                    try {
                      const r = await fetch(`/api/auth/${p}/start`, {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ link: true }),
                      });
                      const data = await r.json();
                      if (!r.ok) throw new Error(data.error);
                      window.location.assign(data.url);
                    } catch (e) {
                      setLinkError(
                        e instanceof Error
                          ? e.message
                          : "Unable to link account"
                      );
                    }
                  }}
                >
                  Link {p}
                </Button>
              ))}
          </div>
          {linkError && (
            <p role="alert" className="text-sm text-red-600">
              {linkError}
            </p>
          )}
        </section>
        <section className="border rounded-xl p-4 space-y-4">
          <h2 className="font-medium">Signed-in devices</h2>
          {sessions.data?.map(s => (
            <div
              key={s.id}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <div className="min-w-0">
                <p className="break-words">{s.agent}</p>
                <p className="text-xs text-neutral-500">
                  {s.current ? "This device · " : ""}Signed in{" "}
                  {new Date(s.createdAt).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={revoke.isPending}
                onClick={() => revoke.mutate({ id: s.id })}
              >
                Sign out
              </Button>
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            disabled={others.isPending}
            onClick={() => others.mutate()}
          >
            Sign out other devices
          </Button>
        </section>
        <section className="border rounded-xl p-4 space-y-3">
          <h2 className="font-medium">Follow requests</h2>
          {!requests.data?.length && (
            <p className="text-sm text-neutral-500">No pending requests.</p>
          )}
          {requests.data?.map(p => (
            <div className="flex flex-wrap items-center gap-2" key={p.userId}>
              <span className="text-sm flex-1 min-w-0 break-words">
                {p.username}
              </span>
              <Button
                size="sm"
                disabled={respond.isPending}
                onClick={() =>
                  respond.mutate({ userId: p.userId, accept: true })
                }
              >
                Accept
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={respond.isPending}
                onClick={() =>
                  respond.mutate({ userId: p.userId, accept: false })
                }
              >
                Decline
              </Button>
            </div>
          ))}
        </section>
        <section className="border rounded-xl p-4 space-y-3">
          <h2 className="font-medium">Blocked accounts</h2>
          {!blocked.data?.length && (
            <p className="text-sm text-neutral-500">No blocked accounts.</p>
          )}
          {blocked.data?.map(p => (
            <div
              className="flex items-center justify-between gap-3"
              key={p.userId}
            >
              <span className="text-sm min-w-0 break-words">{p.username}</span>
              <Button
                size="sm"
                variant="outline"
                disabled={block.isPending}
                onClick={() => block.mutate({ userId: p.userId, block: false })}
              >
                Unblock
              </Button>
            </div>
          ))}
        </section>
        <section className="border rounded-xl p-4 space-y-3">
          <h2 className="font-medium">Your activity</h2>
          <p className="text-sm text-neutral-500">
            {insights.data?.posts ?? "…"} posts · {insights.data?.likes ?? "…"}{" "}
            total likes
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={exported.isPending}
            onClick={() => exported.mutate()}
          >
            Download profile and content data
          </Button>
        </section>
      </div>
    </AppLayout>
  );
}
