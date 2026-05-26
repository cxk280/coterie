"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { MODE_LIST, MODES, type Mode } from "@/lib/modes";
import { defaultConfig } from "@/lib/run-configs";

/**
 * Real run-creation form: task + target workdir + mode → POST /api/runs, then
 * navigate to the live view. Coordinates the locally-installed Claude Code +
 * Codex CLIs.
 */
export function RunForm() {
  const router = useRouter();
  const [task, setTask] = useState("");
  const [workdir, setWorkdir] = useState("");
  const [mode, setMode] = useState<Mode>("adversarial");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRun = task.trim().length > 0 && !busy;

  async function onRun() {
    setBusy(true);
    setError(null);
    try {
      const summary = await api.createRun({
        task: task.trim(),
        mode,
        config: { ...defaultConfig(mode), mode },
        workdir: workdir.trim() || undefined,
      });
      router.push(`/runs/${summary.id}/live`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to start run");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <Label>TASK</Label>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={3}
          placeholder="e.g. Add a retry decorator to src/http.py and cover it with tests."
          className="rounded-lg border px-4 py-3.5 text-sm outline-none"
          style={{
            background: "var(--color-bg-surface)",
            borderColor: "var(--color-border-default)",
            color: "var(--color-text-primary)",
          }}
        />
      </section>

      <section className="flex flex-col gap-2">
        <Label>WORKDIR</Label>
        <input
          type="text"
          value={workdir}
          onChange={(e) => setWorkdir(e.target.value)}
          placeholder="Absolute path to the repo the agents edit (blank = API's cwd)"
          className="rounded-lg border px-4 py-2.5 font-mono text-sm outline-none"
          style={{
            background: "var(--color-bg-surface)",
            borderColor: "var(--color-border-default)",
            color: "var(--color-text-primary)",
          }}
        />
      </section>

      <section className="flex flex-col gap-3">
        <Label>MODE</Label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {MODE_LIST.map((m) => {
            const active = m === mode;
            return (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="flex flex-col gap-1 rounded-lg border px-3 py-3 text-left transition"
                style={{
                  background: active ? "var(--color-bg-raised)" : "var(--color-bg-surface)",
                  borderColor: active ? `var(${MODES[m].colorVar})` : "var(--color-border-default)",
                }}
              >
                <span className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {MODES[m].glyph} {MODES[m].title}
                </span>
                <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {MODES[m].description}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <p className="text-sm" role="status" style={{ color: "var(--color-status-error)" }}>
          {error}
        </p>
      )}

      <div className="flex justify-end">
        <Button variant="primary" modeColor={mode} onClick={onRun} disabled={!canRun}>
          {busy ? "Starting…" : "Run"} <span className="font-mono">▶</span>
        </Button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[12px] font-medium tracking-wider" style={{ color: "var(--color-text-tertiary)" }}>
      {children}
    </h2>
  );
}
