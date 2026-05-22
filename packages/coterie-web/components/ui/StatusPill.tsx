interface StatusPillProps {
  dotColor: "success" | "warning" | "error" | "pending";
  label: string;
}

const COLOR_VAR = {
  success: "--color-status-success",
  warning: "--color-status-warning",
  error: "--color-status-error",
  pending: "--color-status-pending",
} as const;

export function StatusPill({ dotColor, label }: StatusPillProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium"
      style={{ background: "var(--color-bg-raised)", color: "var(--color-text-primary)" }}
    >
      <span
        className="size-1.5 rounded-full"
        style={{ background: `var(${COLOR_VAR[dotColor]})` }}
        aria-hidden
      />
      {label}
    </span>
  );
}
