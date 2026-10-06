import { trpc } from "@/providers/trpc";
export function Preferences() {
  const utils = trpc.useUtils(),
    p = trpc.community.preferences.useQuery(),
    save = trpc.community.setPreferences.useMutation({
      onSuccess: () => void utils.community.preferences.invalidate(),
    });
  const events = trpc.community.mySecurityEvents.useQuery();
  if (!p.data) return null;
  return (
    <section className="border rounded-xl p-4 space-y-3">
      <h2 className="font-medium">Appearance & message privacy</h2>
      {[
        { key: "theme", label: "Theme", values: ["system", "light", "dark"] },
        {
          key: "language",
          label: "Navigation language",
          values: ["en", "fr", "yo"],
        },
        {
          key: "requests",
          label: "Message invitations",
          values: ["followers", "everyone", "nobody"],
        },
      ].map(field => (
        <label
          key={field.key}
          className="flex items-center justify-between gap-3 text-sm"
        >
          {field.label}
          <select
            aria-label={field.label}
            className="border rounded-md p-2"
            disabled={save.isPending}
            value={p.data![field.key as "theme" | "language" | "requests"]}
            onChange={e =>
              save.mutate({ ...p.data!, [field.key]: e.target.value })
            }
          >
            {field.values.map(v => (
              <option key={v} value={v}>
                {
                  (
                    {
                      system: "System",
                      light: "Light",
                      dark: "Dark",
                      en: "English",
                      fr: "Français",
                      yo: "Yorùbá",
                      followers: "People who follow me",
                      everyone: "Everyone",
                      nobody: "Nobody",
                    } as Record<string, string>
                  )[v]
                }
              </option>
            ))}
          </select>
        </label>
      ))}
      <details className="text-xs">
        <summary className="cursor-pointer">Recent security activity</summary>
        {events.data?.map(e => (
          <p className="py-1" key={e.id}>
            {e.event.replaceAll("_", " ")} ·{" "}
            {new Date(e.createdAt).toLocaleString()}
          </p>
        ))}
      </details>
      <p className="text-xs text-neutral-500">
        Navigation labels are translated. Other content may still appear in
        English. Group invitations require acceptance.
      </p>
    </section>
  );
}
