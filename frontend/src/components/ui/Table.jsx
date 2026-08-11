import { cn } from '../../utils/cn';

export function Table({ children }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm whitespace-nowrap">{children}</table>
    </div>
  );
}

// A column is either a label or { label, align }. Numbers get 'right' so their
// digits line up in a column and are comparable down the page.
export function TableHead({ columns }) {
  return (
    <thead className="border-b border-slate-200 text-xs tracking-wide text-slate-500 uppercase">
      <tr>
        {columns.map((column, index) => {
          const { label, align } = typeof column === 'string' ? { label: column } : column;
          return (
            <th
              key={index}
              scope="col"
              className={cn('px-4 py-2.5 font-medium', align === 'right' && 'text-right')}
            >
              {label}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

export function TableBody({ children }) {
  return <tbody className="divide-y divide-slate-100">{children}</tbody>;
}

export function TableRow({ children }) {
  return <tr className="hover:bg-slate-50">{children}</tr>;
}

export function TableCell({ children, align, className }) {
  return (
    <td
      className={cn(
        'px-4 py-3 align-middle text-slate-700',
        align === 'right' && 'text-right',
        // Digits share a width, so figures stack cleanly rather than drifting.
        align === 'right' && 'tabular-nums',
        className,
      )}
    >
      {children}
    </td>
  );
}
