import { AppNav } from "@/components/ui/AppNav";
import { Skeleton } from "@/components/ui/Skeleton";

export default function RunsLoading() {
  return (
    <div className="flex h-screen flex-col">
      <AppNav active="runs" />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 overflow-y-auto px-4 py-8 sm:px-8 lg:px-12">
        <Skeleton className="h-8 w-48" />
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </section>
        <Skeleton className="h-7 w-72" />
        <section className="flex flex-col gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[58px] w-full" />
          ))}
        </section>
      </main>
    </div>
  );
}
