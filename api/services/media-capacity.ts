let active = 0;
// Bound decoders, buffered uploads and FFmpeg children before reading multipart bodies.
// A worker queue and fleet-wide admission control are still required for large deployments.
export function acquireMediaSlot(): (() => void) | undefined {
  if (active >= 2) return undefined;
  active++;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      active--;
    }
  };
}
