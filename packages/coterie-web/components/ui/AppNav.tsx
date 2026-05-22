import Link from "next/link";

import { Button } from "./Button";
import { SpendChip } from "./SpendChip";

interface AppNavProps {
  active?: "runs" | "agents" | "settings";
  spendChip?: { current: number; cap?: number };
}

/**
 * Top-level navigation shared by runs / agents / settings pages.
 * The live-run view uses a different header (Header.tsx) with mode + run context.
 */
export function AppNav({ active = "runs", spendChip }: AppNavProps) {
  return (
    <header
      className="flex h-14 items-center gap-4 border-b px-6"
      style={{
        background: "var(--color-bg-surface)",
        borderColor: "var(--color-border-subtle)",
      }}
    >
      <Link href="/" className="font-mono text-base font-bold" style={{ color: "var(--color-text-primary)" }}>
        ▲ coterie
      </Link>

      <div className="flex-1" />

      <NavLink href="/runs" active={active === "runs"}>
        Runs
      </NavLink>
      <NavLink href="/agents" active={active === "agents"}>
        Agents
      </NavLink>
      <NavLink href="/settings" active={active === "settings"}>
        Settings
      </NavLink>

      {spendChip && <SpendChip current={spendChip.current} cap={spendChip.cap} />}
    </header>
  );
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-sm font-medium transition hover:opacity-90"
      style={{
        background: active ? "var(--color-bg-raised)" : "transparent",
        color: active ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
      }}
    >
      {children}
    </Link>
  );
}
