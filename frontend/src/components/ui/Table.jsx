import { Children, cloneElement, createContext, isValidElement, useContext } from 'react';
import { cn } from '../../utils/cn';

// Below the lg breakpoint a table stops being a table: every row becomes a card
// and every cell becomes a labelled line inside it. Column headers disappear, so
// each cell carries its own label. The labels come from TableHead, matched to
// cells by position, which is why no page had to change. The breakpoint is lg
// rather than sm because six columns of dates and money still do not fit on a
// tablet, and a table that scrolls sideways hides whichever column matters.
const ColumnLabels = createContext([]);

function labelFor(column) {
  if (typeof column === 'string') return column;
  return column?.label ?? '';
}

function columnsOf(children) {
  let columns = [];
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === TableHead) {
      columns = child.props.columns ?? [];
    }
  });
  return columns.map(labelFor);
}

export function Table({ children }) {
  return (
    <ColumnLabels.Provider value={columnsOf(children)}>
      <div className="lg:overflow-x-auto">
        <table className="w-full text-left text-sm lg:whitespace-nowrap">{children}</table>
      </div>
    </ColumnLabels.Provider>
  );
}

// A column is either a label or { label, align }. Numbers get 'right' so their
// digits line up in a column and are comparable down the page.
export function TableHead({ columns }) {
  return (
    <thead className="hidden border-b border-slate-200 text-xs tracking-wide text-slate-500 uppercase lg:table-header-group">
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
  return (
    <tbody className="block lg:table-row-group lg:divide-y lg:divide-slate-100">{children}</tbody>
  );
}

export function TableRow({ children }) {
  const labels = useContext(ColumnLabels);
  return (
    <tr className="mb-3 block rounded-lg border border-slate-200 last:mb-0 lg:mb-0 lg:table-row lg:rounded-none lg:border-0 lg:hover:bg-slate-50">
      {Children.map(children, (child, index) =>
        isValidElement(child)
          ? cloneElement(child, { label: child.props.label ?? labels[index] })
          : child,
      )}
    </tr>
  );
}

export function TableCell({ children, align, className, label }) {
  return (
    <td
      className={cn(
        // Stacked on a narrow screen, an ordinary cell from lg upwards.
        'flex items-baseline justify-between gap-4 border-b border-slate-100 px-4 py-2 last:border-0',
        'text-slate-700 lg:table-cell lg:border-0 lg:py-3 lg:align-middle',
        // Digits share a width, so figures stack cleanly rather than drifting.
        align === 'right' && 'tabular-nums lg:text-right',
        className,
      )}
    >
      {label ? (
        <span className="shrink-0 text-xs font-medium tracking-wide text-slate-500 uppercase lg:hidden">
          {label}
        </span>
      ) : null}
      {/* The wrapper aligns the value on a phone and dissolves on wider screens. */}
      <div className="min-w-0 text-right lg:contents lg:text-left">{children}</div>
    </td>
  );
}
