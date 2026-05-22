import { notFound } from "next/navigation";

import { LiveRunView } from "@/components/runs/LiveRunView";
import { Header } from "@/components/ui/Header";
import { api } from "@/lib/api";

interface PageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export default async function LiveRunByIdPage({ params }: PageProps) {
  const { id } = await params;

  // Fetch initial snapshot from the API. If unreachable, 404.
  let initial;
  try {
    initial = await api.getRun(id);
  } catch {
    notFound();
  }

  return (
    <div className="flex h-screen flex-col">
      <Header
        mode={initial.summary.mode}
        runTitle={initial.summary.task}
        status={{
          dotColor:
            initial.summary.status === "running" || initial.summary.status === "awaiting_human"
              ? "warning"
              : initial.summary.status === "done"
              ? "success"
              : initial.summary.status === "failed"
              ? "error"
              : "pending",
          label: initial.summary.status,
        }}
        spend={{ current: initial.summary.spend_usd }}
      />
      <LiveRunView runId={id} initial={initial} />
    </div>
  );
}
