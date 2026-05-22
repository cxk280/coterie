import { notFound } from "next/navigation";

import { AppNav } from "@/components/ui/AppNav";
import { ErrorState } from "@/components/ui/ErrorState";

interface PageProps {
  params: Promise<{ name: string }>;
}

const STATES: Record<
  string,
  Parameters<typeof ErrorState>[0] & { intro?: React.ReactNode }
> = {
  "first-run": {
    icon: { glyph: "▲", bg: "info" },
    title: "Welcome to Coterie",
    description:
      "Multi-mode LangGraph orchestration for heterogeneous coding agents. Five coordination patterns, one config flag, both Python and TypeScript.",
    info: {
      label: "GET STARTED",
      body: (
        <ol className="flex flex-col gap-1.5">
          <li>
            <span className="font-mono">1. </span> Install the runtime: <code className="font-mono">pip install coterie</code>
          </li>
          <li>
            <span className="font-mono">2. </span> Add at least one provider key:{" "}
            <code className="font-mono">export ANTHROPIC_API_KEY=…</code>
          </li>
          <li>
            <span className="font-mono">3. </span> Run a task:{" "}
            <code className="font-mono">coterie run "refactor …" --config examples/adversarial.yaml</code>
          </li>
        </ol>
      ),
    },
    primary: { label: "Add API key" },
    secondary: { label: "Read the docs" },
  },
  "missing-api-key": {
    icon: { glyph: "!", bg: "warning" },
    title: "ANTHROPIC_API_KEY is not set",
    description:
      "The configured supervisor model (claude-haiku-4-5) requires an Anthropic API key. Coterie tried this run but stopped before invoking any agent because the LLM client couldn't initialize.",
    info: {
      label: "OPTIONS",
      body: (
        <div className="flex flex-col gap-1.5">
          <div>
            <span className="font-medium">Add the key:</span>{" "}
            <code className="font-mono">export ANTHROPIC_API_KEY=sk-ant-…</code>
          </div>
          <div>
            <span className="font-medium">Switch model:</span>{" "}
            <code className="font-mono">router.model: gpt-4o-mini</code> (infers OpenAI)
          </div>
          <div>
            <span className="font-medium">Force provider:</span>{" "}
            <code className="font-mono">COTERIE_LLM_PROVIDER=groq coterie run …</code>
          </div>
        </div>
      ),
    },
    primary: { label: "Add API key" },
    secondary: { label: "Open settings" },
  },
  "budget-exceeded": {
    icon: { glyph: "$", bg: "error" },
    title: "Budget exceeded · run halted",
    description:
      "Spent $5.42 on a $5.00 cap (on_exceed: halt). The graph stopped after the implementer's round-2 invocation. State is checkpointed — you can raise the budget and resume.",
    info: {
      label: "SPEND BY STEP",
      body: (
        <div className="flex items-end gap-2 pt-2">
          {[
            { label: "planner", value: 0.02 },
            { label: "impl r1", value: 0.42 },
            { label: "aud r1", value: 0.31 },
            { label: "judge r1", value: 0.18 },
            { label: "impl r2", value: 1.4 },
            { label: "aud r2", value: 1.5 },
            { label: "judge r2", value: 1.59, over: true },
          ].map((b) => (
            <div key={b.label} className="flex flex-col items-center gap-1">
              <div
                className="w-8 rounded"
                style={{
                  height: `${(b.value / 1.6) * 80}px`,
                  background: b.over ? "var(--color-status-error)" : "var(--color-mode-adversarial)",
                }}
              />
              <span className="font-mono text-[9px]" style={{ color: "var(--color-text-secondary)" }}>
                ${b.value.toFixed(2)}
              </span>
              <span className="text-[9px]" style={{ color: "var(--color-text-tertiary)" }}>
                {b.label}
              </span>
            </div>
          ))}
        </div>
      ),
    },
    primary: { label: "Raise to $10 & resume" },
    secondary: { label: "Archive failed run" },
  },
  "all-agents-failed": {
    icon: { glyph: "✗", bg: "error" },
    title: "All tournament participants failed",
    description:
      "4 of 4 participants exited non-zero. Judge has nothing to score — run terminated with status=failed.",
    info: {
      label: "ERRORS",
      body: (
        <div className="flex flex-col gap-2">
          {[
            { agent: "claude-code", code: "exit 124", msg: "Timeout: exceeded 600s on `npm run test` step" },
            { agent: "codex", code: "exit 1", msg: "TypeError: cannot read properties of undefined (reading 'session') at line 42" },
            { agent: "aider", code: "exit 1", msg: "Could not connect to model — rate limit on Anthropic API" },
            { agent: "cursor", code: "exit 127", msg: "cursor-agent: command not found in PATH" },
          ].map((e) => (
            <div
              key={e.agent}
              className="flex flex-col gap-0.5 rounded border px-3 py-2"
              style={{
                background: "var(--color-bg-canvas)",
                borderColor: "var(--color-status-error)",
              }}
            >
              <div className="flex items-center gap-2 text-[11px]">
                <span className="font-mono font-bold" style={{ color: "var(--color-status-error)" }}>
                  ✗
                </span>
                <span className="font-mono" style={{ color: "var(--color-text-primary)" }}>
                  {e.agent}
                </span>
                <div className="flex-1" />
                <span className="font-mono" style={{ color: "var(--color-status-error)" }}>
                  {e.code}
                </span>
              </div>
              <p className="text-[11px]" style={{ color: "var(--color-text-secondary)" }}>
                {e.msg}
              </p>
            </div>
          ))}
        </div>
      ),
    },
    primary: { label: "Retry with longer timeouts" },
    secondary: { label: "Drop cursor & retry with 3 agents" },
  },
};

export default async function StatePage({ params }: PageProps) {
  const { name } = await params;
  const config = STATES[name];
  if (!config) notFound();

  return (
    <div className="flex h-screen flex-col">
      <AppNav />
      <main className="flex flex-1 items-center justify-center">
        <ErrorState
          icon={config.icon}
          title={config.title}
          description={config.description}
          info={config.info}
          primary={config.primary}
          secondary={config.secondary}
        />
      </main>
    </div>
  );
}
