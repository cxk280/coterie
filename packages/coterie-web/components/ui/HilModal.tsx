"use client";

import { useState } from "react";

import { api } from "@/lib/api";

import { Button } from "./Button";

interface HilModalProps {
  runId: string;
  nextNodes: string[];
  preview?: { lastAgentId?: string; lastRole?: string; lastPreview?: string; spend?: number };
  onResolved?: () => void;
}

export function HilModal({ runId, nextNodes, preview, onResolved }: HilModalProps) {
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = async (decision: "approve" | "reject") => {
    setBusy(decision);
    setError(null);
    try {
      await api.resumeRun(runId, decision);
      onResolved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.65)" }}>
      <article
        className="w-[640px] rounded-xl border"
        style={{
          background: "var(--color-bg-surface)",
          borderColor: "var(--color-border-strong)",
        }}
      >
        <header
          className="flex items-center gap-3 rounded-t-xl px-6 py-5"
          style={{ background: "var(--color-bg-raised)" }}
        >
          <span
            className="flex size-8 items-center justify-center rounded-full font-mono font-bold"
            style={{ background: "var(--color-status-warning)", color: "var(--color-bg-canvas)" }}
          >
            ⏸
          </span>
          <div className="flex flex-col">
            <h2 className="font-bold" style={{ color: "var(--color-text-primary)" }}>
              Checkpoint paused
            </h2>
            <span className="font-mono text-xs" style={{ color: "var(--color-text-secondary)" }}>
              before: {nextNodes.join(", ")}
            </span>
          </div>
        </header>

        <div className="flex flex-col gap-4 px-6 py-5">
          {preview?.lastPreview && (
            <section
              className="flex flex-col gap-1.5 rounded-md border px-3.5 py-2.5"
              style={{
                background: "var(--color-bg-canvas)",
                borderColor: "var(--color-border-subtle)",
              }}
            >
              <h3
                className="text-[11px] font-semibold tracking-wider"
                style={{ color: "var(--color-text-tertiary)" }}
              >
                LAST EVENT
              </h3>
              {preview.lastAgentId && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-mono" style={{ color: "var(--color-text-secondary)" }}>
                    {preview.lastRole}
                  </span>
                  <span style={{ color: "var(--color-text-tertiary)" }}>·</span>
                  <span className="font-mono" style={{ color: "var(--color-text-primary)" }}>
                    {preview.lastAgentId}
                  </span>
                </div>
              )}
              <p
                className="line-clamp-4 whitespace-pre-wrap font-mono text-[11px]"
                style={{ color: "var(--color-text-secondary)" }}
              >
                {preview.lastPreview}
              </p>
            </section>
          )}

          {preview?.spend !== undefined && (
            <div className="flex items-center gap-2 text-xs">
              <span style={{ color: "var(--color-text-tertiary)" }}>spend so far:</span>
              <span className="font-mono" style={{ color: "var(--color-text-primary)" }}>
                ${preview.spend.toFixed(4)}
              </span>
            </div>
          )}

          {error && (
            <p className="text-xs" style={{ color: "var(--color-status-error)" }}>
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center gap-3 rounded-b-xl px-6 pb-5">
          <div className="flex-1" />
          <Button variant="danger" onClick={() => handle("reject")} disabled={busy !== null}>
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </Button>
          <Button
            variant="primary"
            onClick={() => handle("approve")}
            disabled={busy !== null}
          >
            {busy === "approve" ? "Approving…" : "Approve & continue"}{" "}
            <span className="font-mono">↵</span>
          </Button>
        </footer>
      </article>
    </div>
  );
}
