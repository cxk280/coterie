import type { ReactNode } from "react";

import { Button } from "./Button";

interface ErrorStateProps {
  icon: { glyph: string; bg: "warning" | "error" | "success" | "info" };
  title: string;
  description: string;
  info?: { label: string; body: ReactNode };
  primary?: { label: string; onClick?: () => void };
  secondary?: { label: string; onClick?: () => void };
}

const BG_VAR = {
  warning: "--color-status-warning",
  error: "--color-status-error",
  success: "--color-status-success",
  info: "--color-status-info",
} as const;

/**
 * Reusable empty / error state. Mirrors the Figma "Error State Template" component
 * — same icon-title-description-info-actions structure used by the 4 error frames.
 */
export function ErrorState({ icon, title, description, info, primary, secondary }: ErrorStateProps) {
  return (
    <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 py-20 text-center">
      <div
        className="flex size-20 items-center justify-center rounded-full font-mono text-4xl font-bold"
        style={{ background: `var(${BG_VAR[icon.bg]})`, color: "var(--color-bg-canvas)" }}
      >
        {icon.glyph}
      </div>

      <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
        {title}
      </h1>

      <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
        {description}
      </p>

      {info && (
        <section
          className="w-full max-w-xl rounded-lg border px-5 py-4 text-left"
          style={{
            background: "var(--color-bg-surface)",
            borderColor: "var(--color-border-default)",
          }}
        >
          <h2
            className="mb-2 text-[11px] font-semibold tracking-wider"
            style={{ color: "var(--color-text-tertiary)" }}
          >
            {info.label}
          </h2>
          <div className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
            {info.body}
          </div>
        </section>
      )}

      {(primary || secondary) && (
        <div className="mt-2 flex items-center gap-3">
          {primary && (
            <Button variant="primary" onClick={primary.onClick}>
              {primary.label}
            </Button>
          )}
          {secondary && (
            <Button variant="secondary" onClick={secondary.onClick}>
              {secondary.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
