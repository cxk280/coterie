import { RunForm } from "@/components/dashboard/RunForm";
import { LeftRail } from "@/components/dashboard/LeftRail";
import { Header } from "@/components/ui/Header";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  return (
    <div className="flex h-screen flex-col">
      <Header />

      <div className="flex flex-1 overflow-hidden">
        <LeftRail />

        <main className="flex flex-1 flex-col gap-8 overflow-y-auto px-4 py-8 sm:px-8 lg:px-14 lg:py-12">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-bold" style={{ color: "var(--color-text-primary)" }}>
              New run
            </h1>
            <p className="text-sm" style={{ color: "var(--color-text-secondary)" }}>
              Coordinates the locally-installed Claude Code + Codex CLIs. Pick a mode, point it at a
              repo, and watch it run live.
            </p>
          </div>

          <RunForm />
        </main>
      </div>
    </div>
  );
}
