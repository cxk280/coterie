"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { api } from "@/lib/api";
import type { Mode } from "@/lib/modes";

import { Button } from "@/components/ui/Button";

interface RunButtonProps {
  task: string;
  mode: Mode;
  config: Record<string, unknown>;
}

/**
 * Client component because it POSTs to the API and navigates with the returned run id.
 * Falls back to a static link if the API is unreachable.
 */
export function RunButton({ task, mode, config }: RunButtonProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    setBusy(true);
    try {
      const summary = await api.createRun({ task, mode, config: { ...config, mode } });
      router.push(`/runs/${summary.id}/live`);
    } catch (e) {
      // API unreachable — degrade to the static demo route so the UX still works.
      router.push(`/runs/new/${mode}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button variant="primary" modeColor={mode} onClick={onClick} disabled={busy}>
      {busy ? "Starting…" : "Run"} <span className="font-mono">▶</span>
    </Button>
  );
}
