import { useState } from "react";
import { trpc } from "@/providers/trpc";
import { AppLayout } from "@/components/AppLayout";
import { PostCard } from "@/components/PostCard";
export default function Map() {
  const q = trpc.community.map.useQuery();
  const [selected, setSelected] = useState<number | null>(null);
  const current = q.data?.find(p => p.post.id === selected);
  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4 sm:p-8 space-y-4">
        <h1 className="text-xl font-semibold">Post map</h1>
        <p className="text-sm text-neutral-500">
          Only locations authors choose to attach. Coordinates are rounded to
          roughly 1 km; live location is never shared. Privacy and block
          controls still apply.
        </p>
        {q.error && <p role="alert">Map could not load.</p>}
        <div className="border rounded-xl overflow-hidden bg-sky-50">
          <svg
            role="img"
            aria-label="World coordinate map of shared posts"
            viewBox="0 0 720 360"
            className="w-full"
          >
            <rect width="720" height="360" fill="#eff6ff" />
            {Array.from({ length: 13 }, (_, i) => (
              <line
                key={`x${i}`}
                x1={i * 60}
                y1={0}
                x2={i * 60}
                y2={360}
                stroke="#cbd5e1"
                strokeWidth="0.6"
              />
            ))}
            {Array.from({ length: 7 }, (_, i) => (
              <line
                key={`y${i}`}
                x1={0}
                y1={i * 60}
                x2={720}
                y2={i * 60}
                stroke="#cbd5e1"
                strokeWidth="0.6"
              />
            ))}
            <text x="8" y="16" fontSize="11" fill="#64748b">
              90° N
            </text>
            <text x="8" y="350" fontSize="11" fill="#64748b">
              90° S · −180° to 180° longitude
            </text>
            {q.data?.map(p => (
              <g
                key={p.post.id}
                role="button"
                tabIndex={0}
                aria-label={`View post near ${p.post.location || `${p.latitude}, ${p.longitude}`}`}
                onClick={() => setSelected(p.post.id)}
                onKeyDown={e => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelected(p.post.id);
                  }
                }}
              >
                <circle
                  cx={(p.longitude + 180) * 2}
                  cy={(90 - p.latitude) * 2}
                  r={8}
                  fill={selected === p.post.id ? "#be123c" : "#0284c7"}
                />
                <title>
                  {p.post.location || `${p.latitude}, ${p.longitude}`}
                </title>
              </g>
            ))}
          </svg>
        </div>
        {q.data?.length === 0 && (
          <p className="text-sm text-neutral-500">
            No posts have shared coordinates yet. Add a location through your
            post menu.
          </p>
        )}
        {current && (
          <div className="max-w-[470px] mx-auto space-y-3">
            <a
              className="text-sm underline"
              rel="noopener noreferrer"
              target="_blank"
              href={`https://www.openstreetmap.org/?mlat=${current.latitude}&mlon=${current.longitude}#map=13/${current.latitude}/${current.longitude}`}
            >
              Open this area on OpenStreetMap
            </a>
            <PostCard post={current.post} />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
