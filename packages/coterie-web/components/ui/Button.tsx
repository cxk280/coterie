import { clsx } from "clsx";
import type { ComponentProps } from "react";

import { MODES, type Mode } from "@/lib/modes";

interface ButtonProps extends ComponentProps<"button"> {
  variant?: "primary" | "secondary" | "danger";
  modeColor?: Mode;
  size?: "sm" | "md";
}

export function Button({
  variant = "secondary",
  modeColor,
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  const sizeClasses = size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm";
  if (variant === "primary") {
    const bg = modeColor ? `var(${MODES[modeColor].colorVar})` : "var(--color-mode-adversarial)";
    return (
      <button
        type="button"
        className={clsx(
          "inline-flex items-center gap-2 rounded-md font-semibold transition hover:opacity-90",
          sizeClasses,
          className,
        )}
        style={{ background: bg, color: "var(--color-bg-canvas)" }}
        {...rest}
      >
        {children}
      </button>
    );
  }
  if (variant === "danger") {
    return (
      <button
        type="button"
        className={clsx(
          "inline-flex items-center gap-2 rounded-md border font-semibold transition hover:opacity-90",
          sizeClasses,
          className,
        )}
        style={{
          background: "var(--color-bg-raised)",
          color: "var(--color-status-error)",
          borderColor: "var(--color-status-error)",
        }}
        {...rest}
      >
        {children}
      </button>
    );
  }
  return (
    <button
      type="button"
      className={clsx(
        "inline-flex items-center gap-2 rounded-md border font-medium transition hover:opacity-90",
        sizeClasses,
        className,
      )}
      style={{
        background: "var(--color-bg-raised)",
        color: "var(--color-text-primary)",
        borderColor: "var(--color-border-default)",
      }}
      {...rest}
    >
      {children}
    </button>
  );
}
