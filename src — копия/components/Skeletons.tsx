export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-3 space-y-2.5 animate-pulse">
          <div className="aspect-square rounded-btn bg-white/5" />
          <div className="h-3 bg-white/5 rounded w-4/5" />
          <div className="h-3 bg-white/5 rounded w-2/5" />
          <div className="h-7 bg-white/5 rounded" />
        </div>
      ))}
    </div>
  );
}

export function ListRowsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4 flex items-center gap-3 animate-pulse">
          <div className="w-11 h-11 rounded-full bg-white/5 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 bg-white/5 rounded w-1/3" />
            <div className="h-2.5 bg-white/5 rounded w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function BlockSkeleton({ height = 140, className = "" }: { height?: number; className?: string }) {
  return <div className={`card animate-pulse ${className}`} style={{ height }} />;
}
