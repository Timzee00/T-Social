import { useState } from "react";
import { cn } from "@/lib/utils";
export function Avatar({
  src,
  name,
  size = 32,
  ring = false,
  className,
}: {
  src?: string | null;
  name: string;
  size?: number;
  ring?: boolean;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div
      className={cn(
        "shrink-0 rounded-xl overflow-hidden flex items-center justify-center bg-neutral-100 text-neutral-600 font-semibold select-none",
        ring && "ring-2 ring-offset-2 ring-rose-400",
        className
      )}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.34,
        borderRadius: Math.min(12, Math.round(size * 0.22)),
      }}
    >
      {src && src !== failed ? (
        <img
          src={src}
          onError={() => setFailed(src)}
          alt={`${name}'s profile`}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <span aria-label={name}>{(name || "u").slice(0, 2).toUpperCase()}</span>
      )}
    </div>
  );
}
