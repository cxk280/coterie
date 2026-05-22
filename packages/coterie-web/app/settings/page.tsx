import { AppNav } from "@/components/ui/AppNav";
import { PROVIDERS } from "@/lib/mock-data";

const SIDE_NAV = [
  "Providers",
  "Defaults",
  "Budget & limits",
  "HIL checkpoints",
  "Observability",
  "Sandbox",
];

export default function SettingsPage() {
  return (
    <div className="flex h-screen flex-col">
      <AppNav active="settings" />

      <div className="flex flex-1 overflow-hidden">
        {/* Side nav */}
        <aside
          className="flex w-60 flex-col gap-1 border-r px-4 py-7"
          style={{
            background: "var(--color-bg-surface)",
            borderColor: "var(--color-border-subtle)",
          }}
        >
          <h2
            className="px-2 pb-2 text-[11px] font-semibold tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            SETTINGS
          </h2>
          {SIDE_NAV.map((item, i) => (
            <button
              key={item}
              type="button"
              className="rounded-md px-3 py-2 text-left text-sm font-medium transition hover:opacity-90"
              style={{
                background: i === 0 ? "var(--color-bg-raised)" : "transparent",
                color: i === 0 ? "var(--color-text-primary)" : "var(--color-text-secondary)",
              }}
            >
              {item}
            </button>
          ))}
        </aside>

        {/* Content */}
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-7 overflow-y-auto px-14 py-10">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
              Providers
            </h1>
            <div className="flex-1" />
            <span
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs"
              style={{ background: "var(--color-bg-raised)" }}
            >
              <span style={{ color: "var(--color-text-tertiary)" }}>COTERIE_LLM_PROVIDER</span>
              <span className="font-mono" style={{ color: "var(--color-text-secondary)" }}>
                (unset · infer from model)
              </span>
            </span>
          </div>

          <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            Coterie talks to LLMs via a one-method <code className="font-mono">LLMClient</code> ABC. Each role
            (supervisor / judge / consensus engine / moderator / planner) can use any provider — picked from the
            model name or overridden with <code className="font-mono">COTERIE_LLM_PROVIDER</code>.
          </p>

          {PROVIDERS.map((p) => (
            <article
              key={p.name}
              className="flex flex-col gap-3.5 rounded-lg border px-5 py-4"
              style={{
                background: "var(--color-bg-surface)",
                borderColor: "var(--color-border-default)",
              }}
            >
              <header className="flex items-center gap-3">
                <span
                  className="size-2.5 rounded-full"
                  style={{
                    background: p.configured ? "var(--color-status-success)" : "var(--color-text-disabled)",
                  }}
                />
                <h3 className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
                  {p.name}
                </h3>
                {p.isDefault && (
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
                  style={{
                    color: p.configured ? "var(--color-status-success)" : "var(--color-text-tertiary)",
                  }}
                >
                  {p.configured ? "configured" : "not configured"}
                </span>
              </header>

              <div className="flex items-center gap-3">
                <span
                  className="w-40 font-mono text-xs"
                  style={{ color: "var(--color-text-tertiary)" }}
                >
                  {p.envKey}
                </span>
                <div
                  className="flex flex-1 items-center gap-2 rounded-md border px-3 py-2"
                  style={{
                    background: "var(--color-bg-canvas)",
                    borderColor: "var(--color-border-default)",
                  }}
                >
                  <span
                    className="font-mono text-xs"
                    style={{
                      color: p.configured ? "var(--color-text-primary)" : "var(--color-text-disabled)",
                    }}
                  >
                    {p.configured ? "sk-…••••••••••••••••••••••••3f9c" : "Paste API key…"}
                  </span>
                </div>
                <button
                  type="button"
                  className="rounded-md border px-3 py-2 text-xs font-medium"
                  style={{
                    background: "var(--color-bg-raised)",
                    borderColor: "var(--color-border-default)",
                    color: "var(--color-text-primary)",
                  }}
                >
                  {p.configured ? "Test" : "Save"}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-[11px]">
                <span style={{ color: "var(--color-text-tertiary)" }}>Available models:</span>
                {p.models.map((m) => (
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
          ))}
        </main>
      </div>
    </div>
  );
}
