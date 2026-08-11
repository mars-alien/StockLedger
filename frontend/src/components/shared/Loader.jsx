export function Loader({ label = 'Loading' }) {
  return (
    <div className="flex items-center justify-center py-12 text-sm text-slate-500">{label}</div>
  );
}

export function TableSkeleton({ rows = 5, columns = 4 }) {
  return (
    <div className="divide-y divide-slate-100">
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 px-4 py-3.5">
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <div key={columnIndex} className="h-3 flex-1 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      ))}
    </div>
  );
}
