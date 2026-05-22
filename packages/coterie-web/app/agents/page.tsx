import { AppNav } from "@/components/ui/AppNav";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { ADAPTERS, type AdapterEntry } from "@/lib/mock-data";

async function loadAgents(): Promise<AdapterEntry[]> {
  try {
    const live = await api.agents();
    const mockByName = Object.fromEntries(ADAPTERS.map((a) => [a.name, a]));
    return live.map(
      (a) =>
        mockByName[a.name] ?? {
          name: a.name,
          status: "installed" as const,
          version: "—",
          defaultModel: "—",
          lastUsed: "—",
          runs30d: 0,
          notes: "Registered adapter (no metadata available).",
        },
    );
  } catch {
    return ADAPTERS;
  }
}

const STATUS_COLOR = {
  installed: "var(--color-status-success)",
  outdated: "var(--color-status-warning)",
  "not-installed": "var(--color-text-disabled)",
} as const;

export const dynamic = "force-dynamic";

export default async function AgentRegistryPage() {
  const adapters = await loadAgents();
  return (
    <div className="flex h-screen flex-col">
      <AppNav active="agents" />

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 overflow-y-auto px-12 py-8">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
            Agent registry
          </h1>
          <span className="font-mono text-sm" style={{ color: "var(--color-text-tertiary)" }}>
            ADAPTER_REGISTRY
          </span>
          <div className="flex-1" />
          <Button>+ register custom adapter</Button>
        </div>

        <p className="max-w-3xl text-sm" style={{ color: "var(--color-text-secondary)" }}>
          Adapters self-register via <code className="font-mono">@register_adapter</code> (Python) or{" "}
          <code className="font-mono">registerAdapter()</code> (TypeScript) on import. Each adapter wraps one
          coding CLI as a Coterie agent.
        </p>

        <section className="grid grid-cols-3 gap-4">
          {adapters.map((a) => (
            <article
              key={a.name}
              className="flex flex-col gap-3 rounded-lg border px-5 py-4"
              style={{
                background: "var(--color-bg-surface)",
                borderColor: "var(--color-border-default)",
              }}
            >
              <header className="flex items-center gap-2">
                <span className="size-2 rounded-full" style={{ background: STATUS_COLOR[a.status] }} />
                <h3 className="font-mono text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
                  {a.name}
                </h3>
                <div className="flex-1" />
                {a.status === "installed" && a.version && (
                  <span className="font-mono text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                    {a.version}
                  </span>
                )}
                {a.status === "not-installed" && (
                  <button
                    type="button"
                    className="rounded border px-2 py-1 text-[11px] font-medium"
                    style={{
                      background: "var(--color-bg-raised)",
                      borderColor: "var(--color-border-default)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    install
                  </button>
                )}
                {a.status === "outdated" && (
                  <span
                    className="rounded px-2 py-0.5 text-[11px] font-medium"
                    style={{ background: "var(--color-status-warning)", color: "var(--color-bg-canvas)" }}
                  >
                    update available
                  </span>
                )}
              </header>

              <dl className="flex flex-col gap-1 text-[11px]">
                <MetaRow label="default model" value={a.defaultModel} />
                <MetaRow label="last used" value={a.lastUsed} />
                <MetaRow label="runs (30d)" value={String(a.runs30d)} />
              </dl>

              <p className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                {a.notes}
              </p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="font-mono" style={{ color: "var(--color-text-tertiary)" }}>
        {label}
      </dt>
      <div className="flex-1" />
      <dd className="font-mono" style={{ color: "var(--color-text-primary)" }}>
        {value}
      </dd>
    </div>
  );
}
