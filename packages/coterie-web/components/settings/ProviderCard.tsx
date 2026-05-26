"use client";

import { useState } from "react";

import { api, type Provider } from "@/lib/api";

interface ProviderCardProps {
  name: string;
  provider: Provider;
  envKey: string;
  configured: boolean;
  isDefault?: boolean;
  models: string[];
}

type Result = { ok: boolean; detail: string } | null;

export function ProviderCard({
  name,
  provider,
  envKey,
  configured,
  isDefault,
  models,
}: ProviderCardProps) {
  const [key, setKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<Result>(null);

  async function onTest() {
    setTesting(true);
    setResult(null);
    try {
      setResult(await api.testProvider({ provider, api_key: key }));
    } catch (e) {
      setResult({ ok: false, detail: e instanceof Error ? e.message : "request failed" });
    } finally {
      setTesting(false);
    }
  }

  const canTest = key.trim().length > 0 && !testing;

  return (
    <article
      className="flex flex-col gap-3.5 rounded-lg border px-5 py-4"
      style={{ background: "var(--color-bg-surface)", borderColor: "var(--color-border-default)" }}
    >
      <header className="flex items-center gap-3">
        <span
          className="size-2.5 rounded-full"
          style={{
            background: configured ? "var(--color-status-success)" : "var(--color-text-disabled)",
          }}
        />
        <h3 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
          {name}
        </h3>
        {isDefault && (
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold tracking-wider"
            style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)" }}
          >
            DEFAULT
          </span>
        )}
        <div className="flex-1" />
        <span
          className="font-mono text-[11px]"
          style={{ color: configured ? "var(--color-status-success)" : "var(--color-text-tertiary)" }}
        >
          {configured ? "configured" : "not configured"}
        </span>
      </header>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <label className="font-mono text-xs sm:w-40" style={{ color: "var(--color-text-tertiary)" }}>
          {envKey}
        </label>
        <input
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={configured ? "Paste a new key to test…" : "Paste API key…"}
          className="flex-1 rounded-md border px-3 py-2 font-mono text-xs outline-none"
          style={{
            background: "var(--color-bg-canvas)",
            borderColor: "var(--color-border-default)",
            color: "var(--color-text-primary)",
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canTest) onTest();
          }}
        />
        <button
          type="button"
          onClick={onTest}
          disabled={!canTest}
          className="rounded-md border px-3 py-2 text-xs font-medium transition disabled:opacity-40"
          style={{
            background: "var(--color-bg-raised)",
            borderColor: "var(--color-border-default)",
            color: "var(--color-text-primary)",
          }}
        >
          {testing ? "Testing…" : "Test"}
        </button>
      </div>

      {result && (
        <p
          className="flex items-center gap-1.5 text-xs"
          role="status"
          style={{
            color: result.ok ? "var(--color-status-success)" : "var(--color-status-error)",
          }}
        >
          <span aria-hidden>{result.ok ? "✓" : "✗"}</span>
          {result.detail}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span style={{ color: "var(--color-text-tertiary)" }}>Available models:</span>
        {models.map((m) => (
          <span
            key={m}
            className="rounded px-1.5 py-0.5 font-mono text-[10px]"
            style={{ background: "var(--color-bg-raised)", color: "var(--color-text-secondary)" }}
          >
            {m}
          </span>
        ))}
      </div>
    </article>
  );
}
