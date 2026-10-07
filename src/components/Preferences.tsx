import { trpc } from "@/providers/trpc";

const privacyLabels: Record<string, string> = {
  followers: "People I follow",
  everyone: "Everyone",
  nobody: "Nobody",
};

export function Preferences() {
  const utils = trpc.useUtils(),
    p = trpc.community.preferences.useQuery(),
    save = trpc.community.setPreferences.useMutation({
      onSuccess: () => void utils.community.preferences.invalidate(),
    });
  const events = trpc.community.mySecurityEvents.useQuery();

  if (!p.data) return null;

  const update = (patch: Partial<typeof p.data>) =>
    save.mutate({ ...p.data!, ...patch });

  return (
    <section className="surface-card page-enter space-y-5">
      <div>
        <h2 className="font-semibold">Personal experience & privacy</h2>
        <p className="mt-1 text-xs text-neutral-500">
          These controls belong to you. Group owners cannot override your
          direct-message, invite or mention privacy.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="setting-row">
          <span>
            <span className="block text-sm font-medium">Theme</span>
            <span className="block text-xs text-neutral-500">
              Match your device or choose a fixed theme.
            </span>
          </span>
          <select
            aria-label="Theme"
            className="control-select"
            disabled={save.isPending}
            value={p.data.theme}
            onChange={e =>
              update({
                theme: e.target.value as "system" | "light" | "dark",
              })
            }
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <label className="setting-row">
          <span>
            <span className="block text-sm font-medium">
              Navigation language
            </span>
            <span className="block text-xs text-neutral-500">
              Applies to supported interface labels.
            </span>
          </span>
          <select
            aria-label="Navigation language"
            className="control-select"
            disabled={save.isPending}
            value={p.data.language}
            onChange={e =>
              update({ language: e.target.value as "en" | "fr" | "yo" })
            }
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="yo">Yorùbá</option>
          </select>
        </label>
      </div>

      <div className="grid gap-3">
        {[
          {
            key: "requests" as const,
            label: "Who can start a private chat",
            hint: "People I follow is the safer default for message requests.",
          },
          {
            key: "groupInvites" as const,
            label: "Who can add me to a group",
            hint: "Invite links you choose to open still work.",
          },
          {
            key: "mentions" as const,
            label: "Who can mention or tag me",
            hint: "Used for status mentions and group-message mentions.",
          },
        ].map(field => (
          <label className="setting-row" key={field.key}>
            <span>
              <span className="block text-sm font-medium">{field.label}</span>
              <span className="block text-xs text-neutral-500">
                {field.hint}
              </span>
            </span>
            <select
              aria-label={field.label}
              className="control-select"
              disabled={save.isPending}
              value={p.data[field.key]}
              onChange={e =>
                update({
                  [field.key]: e.target.value as
                    | "followers"
                    | "everyone"
                    | "nobody",
                })
              }
            >
              {["followers", "everyone", "nobody"].map(value => (
                <option key={value} value={value}>
                  {privacyLabels[value]}
                </option>
              ))}
            </select>
          </label>
        ))}

        <label className="setting-row">
          <span>
            <span className="block text-sm font-medium">Read receipts</span>
            <span className="block text-xs text-neutral-500">
              When off, people you privately message will not see when you read
              their messages.
            </span>
          </span>
          <input
            aria-label="Read receipts"
            type="checkbox"
            className="toggle-control"
            checked={p.data.readReceipts}
            disabled={save.isPending}
            onChange={e => update({ readReceipts: e.target.checked })}
          />
        </label>


      </div>

      <details className="rounded-xl border p-3 text-xs">
        <summary className="cursor-pointer font-medium">
          Recent security activity
        </summary>
        <div className="mt-2 space-y-1">
          {events.data?.map(e => (
            <p className="py-1" key={e.id}>
              {e.event.replaceAll("_", " ")} ·{" "}
              {new Date(e.createdAt).toLocaleString()}
            </p>
          ))}
          {!events.data?.length && (
            <p className="text-neutral-500">No recent security events.</p>
          )}
        </div>
      </details>
    </section>
  );
}
