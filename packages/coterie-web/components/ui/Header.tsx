import { clsx } from "clsx";

import type { Mode } from "@/lib/modes";

import { ModeBadge } from "./ModeBadge";
import { SpendChip } from "./SpendChip";
import { StatusPill } from "./StatusPill";

interface HeaderProps {
  mode?: Mode;
  runTitle?: string;
  status?: { dotColor: "success" | "warning" | "error" | "pending"; label: string };
  spend?: { current: number; cap?: number };
  rightActions?: React.ReactNode;
  className?: string;
}

export function Header({ mode, runTitle, status, spend, rightActions, className }: HeaderProps) {
  return (
    <header
      className={clsx(
        "flex h-14 items-center gap-4 border-b px-6",
        className,
      )}
      style={{
        background: "var(--color-bg-surface)",
        borderColor: "var(--color-border-subtle)",
      }}
    >
      <span className="font-mono text-base font-bold" style={{ color: "var(--color-text-primary)" }}>
        ▲ coterie
      </span>

      {mode && <ModeBadge mode={mode} />}

      {runTitle && (
        <span
          className="line-clamp-1 max-w-[40rem] text-sm font-medium"
          style={{ color: "var(--color-text-primary)" }}
        >
          {runTitle}
        </span>
      )}

      <div className="flex-1" />

      {status && <StatusPill dotColor={status.dotColor} label={status.label} />}
      {spend && <SpendChip current={spend.current} cap={spend.cap} />}
      {rightActions}
    </header>
  );
}
