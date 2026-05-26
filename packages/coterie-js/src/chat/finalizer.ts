/** The finalizer: after the agents deliberate, one agent (the judge seat) acts.
 *  It runs in the REAL workdir, applies whatever edits/actions fulfil the user's
 *  request — using the deliberation as advice — and writes the plain-prose reply.
 *  This is the sole step that mutates the user's files and the sole source of the
 *  answer, so the user never sees raw findings JSON. */

import { LocalSubprocessExecutor, type AdapterExecutor } from "../core/executor.js";
import { ADAPTER_REGISTRY } from "../core/registry.js";
import type { AgentRun } from "../core/state.js";

export function buildFinalizerPrompt(task: string, digest: string): string {
  return `${task}

---
A panel of coding agents just deliberated on the request above. Their review and
attempts are summarised below — treat it as advice and critique, not as final or
necessarily correct work:

${digest}
---

Now finish the job. In this working directory, make any file edits or actions
needed to fully satisfy the user's request, drawing on the deliberation above and
correcting any mistakes in it. Then write the user a short, clear reply describing
what you did (or directly answering, if no edit was needed). Reply in plain prose
for a human — do NOT output JSON, finding-lists, or tool logs.`;
}

export interface FinalizerOpts {
  task: string;
  digest: string;
  workdir: string;
  /** Adapter to run as the finalizer (defaults to the first available agent). */
  adapter?: string;
  model?: string;
  agentId?: string;
  executor?: AdapterExecutor;
}

/** Run the finalizer agent and return its prose answer plus the raw run record. */
export async function runFinalizer(opts: FinalizerOpts): Promise<{ answer: string; run: AgentRun }> {
  const ctor = ADAPTER_REGISTRY.require(opts.adapter ?? "claude-code");
  const adapter = new ctor(opts.agentId ?? "finalizer", { model: opts.model });
  const executor = opts.executor ?? new LocalSubprocessExecutor();
  const prompt = buildFinalizerPrompt(opts.task, opts.digest);

  const result = executor.execute(adapter, prompt, opts.workdir, { timeoutMs: 600_000 });
  const run: AgentRun = {
    agent_id: adapter.agent_id,
    role: "finalizer",
    prompt,
    stdout: result.stdout,
    stderr: result.stderr,
    exit_code: result.exit_code,
    files_changed: result.files_changed,
    duration_s: result.duration_s,
    cost_estimate_usd: result.cost_estimate_usd,
  };
  return { answer: (result.stdout ?? "").trim(), run };
}
