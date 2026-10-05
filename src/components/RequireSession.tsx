import type { ReactNode } from "react";
import { Link } from "react-router";
import { useAuth } from "@/hooks/useAuth";
export function RequireSession({ children }: { children: ReactNode }) {
  const { user, isLoading, error, refresh } = useAuth({
    redirectOnUnauthenticated: true,
  });
  if (isLoading)
    return (
      <div
        role="status"
        className="min-h-dvh grid place-items-center text-sm text-neutral-500"
      >
        Opening t…
      </div>
    );
  if (error)
    return (
      <div
        role="alert"
        className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6"
      >
        <p>We couldn’t connect. Please try again.</p>
        <button onClick={() => refresh()} className="text-sm underline">
          Retry
        </button>
        <Link to="/login" className="text-sm underline">
          Back to sign-in
        </Link>
      </div>
    );
  return user ? <>{children}</> : null;
}
