import { ProviderCard } from "@/components/settings/ProviderCard";
import { TokenManager } from "@/components/settings/TokenManager";
import { AppNav } from "@/components/ui/AppNav";
import type { Provider } from "@/lib/api";
import { PROVIDERS } from "@/lib/mock-data";

const SIDE_NAV = [
  "Providers",
  "Tokens",
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
          className="hidden w-60 flex-col gap-1 border-r px-4 py-7 md:flex"
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
        <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-7 overflow-y-auto px-4 py-10 sm:px-8 lg:px-14">
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
            <ProviderCard
              key={p.name}
              name={p.name}
              provider={p.name.toLowerCase() as Provider}
              envKey={p.envKey}
              configured={p.configured}
              isDefault={p.isDefault}
              models={p.models}
            />
          ))}

          <div className="h-px" style={{ background: "var(--color-border-subtle)" }} />

          <TokenManager />
        </main>
      </div>
    </div>
  );
}
