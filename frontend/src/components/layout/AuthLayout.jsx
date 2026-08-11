export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <p className="text-sm font-semibold tracking-tight text-indigo-600">StockLedger</p>
          <h1 className="mt-3 text-xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-balance text-slate-500">{subtitle}</p>}
        </div>

        <div className="mt-6 rounded-lg bg-white p-6 ring-1 ring-slate-200 shadow-sm">
          {children}
        </div>

        {footer && <p className="mt-5 text-center text-sm text-slate-500">{footer}</p>}
      </div>
    </div>
  );
}
