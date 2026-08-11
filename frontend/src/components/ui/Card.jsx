import { cn } from '../../utils/cn';

export function Card({ className, children }) {
  return (
    <div className={cn('rounded-lg bg-white ring-1 ring-slate-200', className)}>{children}</div>
  );
}

export function CardHeader({ title, description, action }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
      </div>
      {action}
    </div>
  );
}
