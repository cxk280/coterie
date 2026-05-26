/** `coterie doctor`: report which agent CLIs are installed and signed in, and
 *  whether there are enough to run. Coterie coordinates multiple agents, so it
 *  needs at least two — but any two will do, and it happily uses more. The set of
 *  agents it knows about (ALL_AGENT_CLIS) is registry-derived, so this grows as
 *  new adapters are added. No agents are invoked here — it's a pure status check. */

import { ALL_AGENT_CLIS, checkAgent, type AgentStatus } from "./preflight.js";

/** Fewest agents needed to coordinate a round (you can't deliberate with one). */
export const MIN_AGENTS = 2;

export interface DoctorResult {
  statuses: AgentStatus[];
  ready: number;
  ok: boolean;
}

export function runDoctor(clis: string[] = ALL_AGENT_CLIS): DoctorResult {
  const statuses = clis.map(checkAgent);
  const ready = statuses.filter((s) => s.ok).length;
  return { statuses, ready, ok: ready >= MIN_AGENTS };
}

export function formatDoctor(r: DoctorResult): string {
  const total = r.statuses.length;
  const lines = [
    `Coterie coordinates multiple agents, so it needs at least ${MIN_AGENTS} of these ` +
      `installed and signed in (any combination — and it'll use more if you have them):`,
    "",
  ];
  const width = Math.max(...r.statuses.map((s) => s.cli.length));
  for (const s of r.statuses) {
    lines.push(`  ${s.ok ? "✓" : "✗"} ${s.cli.padEnd(width)}  — ${s.reason}`);
    if (s.fix) lines.push(`      ${s.fix}`);
  }
  lines.push("");
  lines.push(
    r.ok
      ? `${r.ready} of ${total} ready — good to go.`
      : `${r.ready} of ${total} ready — Coterie needs at least ${MIN_AGENTS}. ` +
          `Install or sign in to one more above.`,
  );
  lines.push(
    "",
    "Sign-in is detected from each CLI's standard credential location (honoring its " +
      "env overrides). If a CLI works in your shell but shows as not signed in here, " +
      "it's a false alarm — Coterie uses whatever your shell does.",
  );
  return lines.join("\n");
}
