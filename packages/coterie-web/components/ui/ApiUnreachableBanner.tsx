interface ApiUnreachableBannerProps {
  hint?: string;
}

/** Shown at the top of any page that loaded from mock data because the API was unreachable. */
export function ApiUnreachableBanner({ hint }: ApiUnreachableBannerProps) {
  return (
    <div
      className="flex items-center gap-3 border-b px-6 py-2.5 text-xs"
      style={{
        background: "var(--color-bg-raised)",
        borderColor: "var(--color-status-warning)",
        color: "var(--color-text-secondary)",
      }}
    >
      <span style={{ color: "var(--color-status-warning)" }}>●</span>
      <span style={{ color: "var(--color-text-primary)" }}>
        coterie-api unreachable
      </span>
      <span style={{ color: "var(--color-text-tertiary)" }}>
        — showing demo data. {hint ?? "Start the API with `coterie-api --reload` to use a real backend."}
      </span>
    </div>
  );
}
