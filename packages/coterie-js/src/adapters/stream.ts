/** Shared helpers for turning an agent's streamed tool-call event into a short,
 *  human-readable progress note. */

/** A compact hint for a tool call — the file, command, pattern, or query it
 *  targets — so a live line reads "→ Read src/foo.ts" rather than just "→ Read". */
export function toolHint(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  // For a file path, show just the basename — agents run in an isolated worktree,
  // so the absolute temp-dir prefix is noise.
  const path = o.file_path ?? o.path;
  if (typeof path === "string" && path) return ` ${path.split("/").pop()}`;
  const other = o.command ?? o.pattern ?? o.query ?? o.url ?? o.prompt;
  if (other == null) return "";
  const s = Array.isArray(other) ? other.join(" ") : String(other);
  return s ? ` ${s.replace(/\s+/g, " ").slice(0, 80)}` : "";
}
