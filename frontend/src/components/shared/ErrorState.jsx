import { Button } from '../ui/Button';

export function ErrorState({ message, onRetry }) {
  return (
    <div className="px-4 py-12 text-center">
      <p className="text-sm font-medium text-slate-900">That did not load</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">{message}</p>
      {onRetry && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  );
}
