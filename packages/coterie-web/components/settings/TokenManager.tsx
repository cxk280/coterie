"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";

interface TokenRow {
  id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked: boolean;
}

export function TokenManager() {
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);

  const load = async () => {
    setError(null);
    try {
      const rows = await fetch(`${process.env.NEXT_PUBLIC_COTERIE_API_URL ?? "http://127.0.0.1:8000"}/api/auth/tokens`, {
        headers: {
          ...(typeof window !== "undefined" && process.env.NEXT_PUBLIC_COTERIE_API_TOKEN
            ? { Authorization: `Bearer ${process.env.NEXT_PUBLIC_COTERIE_API_TOKEN}` }
            : {}),
        },
        credentials: "include",
      });
      if (!rows.ok) throw new Error(`status ${rows.status}`);
      setTokens(await rows.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTokens([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    setBusy(true);
    setError(null);
    setNewSecret(null);
    try {
      const res = await api.createToken(name);
      setNewSecret(res.token);
      setName("");
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revoke this token? Any clients using it will stop working.")) return;
    try {
      await api.revokeToken(id);
      void load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold" style={{ color: "var(--color-text-primary)" }}>
          Personal access tokens
        </h2>
        <span className="font-mono text-xs" style={{ color: "var(--color-text-tertiary)" }}>
          ck_…
        </span>
      </div>

      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        Use these to authenticate the TUI, CI, or any other API client. The full secret is shown
        exactly once — save it immediately.
      </p>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Token name (e.g. laptop, ci-runner)"
          className="flex-1 rounded-md border px-3 py-2 text-sm font-mono"
          style={{
            background: "var(--color-bg-canvas)",
            borderColor: "var(--color-border-default)",
            color: "var(--color-text-primary)",
          }}
        />
        <Button variant="primary" disabled={busy || !name.trim()} onClick={create}>
          {busy ? "Creating…" : "Create"}
        </Button>
      </div>

      {newSecret && (
        <div
          className="rounded-md border px-4 py-3"
          style={{
            background: "var(--color-bg-canvas)",
            borderColor: "var(--color-status-success)",
          }}
        >
          <h3
            className="mb-2 text-[11px] font-semibold tracking-wider"
            style={{ color: "var(--color-status-success)" }}
          >
            NEW TOKEN — COPY IT NOW
          </h3>
          <code
            className="select-all break-all font-mono text-xs"
            style={{ color: "var(--color-text-primary)" }}
          >
            {newSecret}
          </code>
        </div>
      )}

      {error && (
        <p className="text-xs" style={{ color: "var(--color-status-error)" }}>
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {tokens === null && (
          <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
            Loading…
          </p>
        )}
        {tokens?.length === 0 && (
          <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
            No tokens yet.
          </p>
        )}
        {tokens?.map((t) => (
          <article
            key={t.id}
            className="flex items-center gap-3 rounded-md border px-4 py-3"
            style={{
              background: "var(--color-bg-surface)",
              borderColor: "var(--color-border-subtle)",
              opacity: t.revoked ? 0.5 : 1,
            }}
          >
            <div className="flex flex-col">
              <span className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>
                {t.name}
              </span>
              <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                {t.prefix}… · created {t.created_at.slice(0, 10)}
                {t.last_used_at ? ` · last used ${t.last_used_at.slice(0, 10)}` : " · never used"}
              </span>
            </div>
            <div className="flex-1" />
            {t.revoked ? (
              <span
                className="rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider"
                style={{ background: "var(--color-bg-raised)", color: "var(--color-text-tertiary)" }}
              >
                REVOKED
              </span>
            ) : (
              <Button variant="danger" size="sm" onClick={() => revoke(t.id)}>
                Revoke
              </Button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
