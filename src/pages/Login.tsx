import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
type Availability = { providers: string[]; phone: boolean; staging?: boolean };
const labels: Record<string, string> = {
  google: "Continue with Google",
  facebook: "Continue with Facebook",
  chatgpt: "Continue with ChatGPT",
};
async function send(path: string, body: object) {
  const response = await fetch(`/api/auth/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Please try again");
  return data;
}
export default function Login() {
  const [availability, setAvailability] = useState<Availability | null>(null),
    [error, setError] = useState(""),
    [phone, setPhone] = useState(""),
    [code, setCode] = useState(""),
    [challenge, setChallenge] = useState(""),
    [busy, setBusy] = useState(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  useEffect(() => {
    const abort = new AbortController();
    fetch("/api/auth/providers", { signal: abort.signal })
      .then(r => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setAvailability)
      .catch(e => {
        if (e.name !== "AbortError")
          setError("Sign-in is temporarily unavailable. Please try again.");
      });
    return () => abort.abort();
  }, []);
  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);
  async function act(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="min-h-dvh bg-neutral-50 flex flex-col items-center justify-center p-5">
      <section className="w-full max-w-sm rounded-2xl border bg-white p-6 sm:p-8 shadow-sm">
        <div className="mb-8">
          <p className="text-4xl font-black tracking-tight">
            t<span className="text-rose-500">.</span>
          </p>
          <h1 className="mt-6 text-2xl font-semibold tracking-tight">
            Your people. Your moments.
          </h1>
          <p className="mt-2 text-sm text-neutral-500">
            Sign in to share, discover and stay close.
          </p>
        </div>
        <div className="space-y-3">
          {!availability && !error && (
            <p role="status" className="text-sm text-neutral-500">
              Loading sign-in options…
            </p>
          )}
          {availability?.providers.map(provider => (
            <Button
              key={provider}
              variant="outline"
              className="w-full h-11 text-sm"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const data = await send(`${provider}/start`, {});
                  window.location.assign(data.url);
                })
              }
            >
              {labels[provider]}
            </Button>
          ))}
          {availability?.staging && (
            <Button
              variant="outline"
              className="w-full h-11 text-sm"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await send("staging", {});
                  await refresh();
                  navigate("/");
                })
              }
            >
              Enter live demo
            </Button>
          )}
          {availability?.phone && (
            <form
              className="space-y-3 border-t pt-5"
              onSubmit={e => {
                e.preventDefault();
                act(async () => {
                  if (!challenge) {
                    const data = await send("phone/send", { phone });
                    setChallenge(data.challenge);
                  } else {
                    await send("phone/verify", { code, challenge });
                    await refresh();
                    navigate("/");
                  }
                });
              }}
            >
              <label htmlFor="phone" className="block text-sm font-medium">
                Phone number
              </label>
              <Input
                id="phone"
                type="tel"
                autoComplete="tel"
                placeholder="+2348012345678"
                value={phone}
                disabled={!!challenge || busy}
                onChange={e => setPhone(e.target.value)}
                required
              />
              {challenge && (
                <>
                  <label htmlFor="otp" className="block text-sm font-medium">
                    Verification code
                  </label>
                  <Input
                    id="otp"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={10}
                    value={code}
                    onChange={e => setCode(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="text-sm text-neutral-500 underline"
                    onClick={() => {
                      setChallenge("");
                      setCode("");
                    }}
                  >
                    Use another number
                  </button>
                </>
              )}
              <Button className="w-full h-11" disabled={busy}>
                {busy
                  ? "Please wait…"
                  : challenge
                    ? "Verify and sign in"
                    : "Send verification code"}
              </Button>
            </form>
          )}
          {availability &&
            !availability.providers.length &&
            !availability.phone &&
            !availability.staging && (
              <p
                role="status"
                className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-600"
              >
                Sign-in is being set up. Please check back soon.
              </p>
            )}
          {(error || params.get("error")) && (
            <p role="alert" className="text-sm text-red-600">
              {error ||
                (params.get("error") === "cancelled"
                  ? "Sign-in was cancelled. You can try again."
                  : "Sign-in could not be completed. Please try again.")}
            </p>
          )}
        </div>
      </section>
      <p className="mt-6 text-xs text-neutral-500">Powered by Timzee Corp</p>
    </main>
  );
}
