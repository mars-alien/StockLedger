import { cn } from '../../utils/cn';

export function Card({ className, children }) {
  return (
    <div className={cn('rounded-lg bg-white ring-1 ring-slate-200', className)}>{children}</div>
  );
}

export function CardHeader({ title, description, action }) {
  return (
    // Side by side once there is room for both. On a phone the title keeps its
    // own line rather than being squeezed into a column beside the controls.
    <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {action && <div className="w-full sm:w-auto">{action}</div>}
    </div>
  );
}
