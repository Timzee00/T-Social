import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" }
)
  .split("\0")
  .filter(Boolean);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[A-Z0-9]{16}\b/,
  /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/,
  /\bsk_(?:live|test)_[A-Za-z0-9]{30,}\b/,
  /\bsk-proj-[A-Za-z0-9_-]{40,}\b/,
];
const findings = [];
for (const path of files) {
  let bytes;
  try {
    bytes = readFileSync(path);
  } catch {
    continue;
  }
  if (bytes.includes(0)) continue;
  const source = bytes.toString("utf8");
  if (patterns.some(p => p.test(source))) findings.push(path);
}
if (findings.length) {
  console.error(
    `Potential secrets in ${findings.join(", ")}. Values are deliberately omitted.`
  );
  process.exitCode = 1;
} else
  console.log(
    `No high-confidence secret patterns in ${files.length} source files. This is a heuristic scan, not proof of absence.`
  );
