interface SpendChipProps {
  current: number;
  cap?: number;
}

export function SpendChip({ current, cap }: SpendChipProps) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1"
      style={{ background: "var(--color-bg-raised)" }}
    >
      <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
        spend
      </span>
      <span className="font-mono text-xs" style={{ color: "var(--color-text-primary)" }}>
        ${current.toFixed(2)}
      </span>
      {cap !== undefined && (
        <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
          / ${cap.toFixed(2)}
        </span>
      )}
    </span>
  );
}
