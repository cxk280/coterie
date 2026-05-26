import { Skeleton } from "@/components/ui/Skeleton";

export default function RunDetailLoading() {
  return (
    <div className="flex h-screen flex-col">
      <header
        className="flex h-14 items-center gap-3 border-b px-4 sm:px-6"
        style={{ background: "var(--color-bg-surface)", borderColor: "var(--color-border-subtle)" }}
      >
        <Skeleton className="h-7 w-16" />
        <Skeleton className="h-5 w-24" />
        <Skeleton className="hidden h-5 w-80 sm:block" />
      </header>
      <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
        <section
          className="flex flex-1 flex-col gap-3 px-4 py-7 sm:px-8"
          style={{ background: "var(--color-bg-canvas)" }}
        >
          <Skeleton className="h-6 w-40" />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </section>
        <aside
          className="flex w-full flex-col gap-6 border-t px-5 py-7 lg:w-[440px] lg:border-t-0"
          style={{ background: "var(--color-bg-surface)", borderColor: "var(--color-border-subtle)" }}
        >
          <Skeleton className="h-5 w-36" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-24 w-full" />
        </aside>
      </div>
    </div>
  );
}
