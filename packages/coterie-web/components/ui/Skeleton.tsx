import { clsx } from "clsx";

/** A pulsing placeholder block. Compose several to mirror the shape of the
 *  content that's loading. Decorative, so hidden from assistive tech. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={clsx("animate-pulse rounded-md", className)}
      style={{ background: "var(--color-bg-raised)" }}
      aria-hidden
    />
  );
}
