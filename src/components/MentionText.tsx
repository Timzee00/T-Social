import { Fragment } from "react";
import { Link } from "react-router";

const tokenPattern = /(@group:[a-z0-9][a-z0-9_-]{0,39}|@[A-Za-z0-9_]{1,50})/gi;

export function MentionText({ text }: { text: string }) {
  const parts = text.split(tokenPattern);
  return (
    <>
      {parts.map((part, index) => {
        if (!part) return null;
        const lower = part.toLowerCase();
        if (lower.startsWith("@group:")) {
          const handle = lower.slice(7);
          return (
            <Link
              key={`${part}-${index}`}
              className="mention-link"
              to={`/groups?group=${encodeURIComponent(handle)}`}
            >
              {part}
            </Link>
          );
        }
        if (part.startsWith("@")) {
          return (
            <Link
              key={`${part}-${index}`}
              className="mention-link"
              to={`/${part.slice(1)}`}
            >
              {part}
            </Link>
          );
        }
        return <Fragment key={index}>{part}</Fragment>;
      })}
    </>
  );
}
