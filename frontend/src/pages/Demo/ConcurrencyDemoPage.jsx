import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { placeDemoOrder, useDemoState, useResetDemo } from '../../api/demo';
import { PageHeader } from '../../components/layout/PageHeader';
import { ErrorBanner } from '../../components/shared/ErrorBanner';
import { Loader } from '../../components/shared/Loader';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { useAuthStore } from '../../store/authStore';

const BURST_SIZE = 50;

export function ConcurrencyDemoPage() {
  const organizationId = useAuthStore((state) => state.organization?.id);

  const [unsafe, setUnsafe] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  const demo = useDemoState({ organizationId });
  const reset = useResetDemo(organizationId);

  const variant = demo.data?.variant ?? null;

  const fire = async () => {
    setRunning(true);
    setResult(null);

    const startedAt = performance.now();
    const attempts = await Promise.allSettled(
      Array.from({ length: BURST_SIZE }, () => placeDemoOrder({ variantId: variant.id, unsafe })),
    );
    const durationMs = Math.round(performance.now() - startedAt);

    const log = attempts.map((attempt, index) => {
      if (attempt.status === 'fulfilled') {
        return { index, status: attempt.value.status, label: 'created' };
      }
      const response = attempt.reason?.response;
      return {
        index,
        status: response?.status ?? 0,
        label: response?.data?.error?.code ?? 'network error',
      };
    });

    const { data: state } = await demo.refetch();

    setResult({
      durationMs,
      created: log.filter((entry) => entry.status === 201).length,
      rejected: log.filter((entry) => entry.status === 409).length,
      other: log.filter((entry) => entry.status !== 201 && entry.status !== 409).length,
      finalStock: state?.variant?.quantityOnHand ?? null,
      log,
    });
    setRunning(false);
  };

  if (demo.isPending) {
    return <Loader label="Loading the demo" />;
  }

  const busy = running || reset.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Concurrency demo"
        description="One unit of stock, fifty buyers, and the difference a row lock makes."
        action={
          <Button variant="secondary" disabled={busy} onClick={() => reset.mutate()}>
            {reset.isPending ? 'Resetting' : 'Reset demo'}
          </Button>
        }
      />

      {reset.isError && (
        <ErrorBanner>{errorMessage(reset.error, 'The demo could not be reset')}</ErrorBanner>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Run it"
            action={
              variant && (
                <Badge tone={variant.quantityOnHand < 0 ? 'amber' : 'indigo'}>
                  {variant.quantityOnHand} in stock
                </Badge>
              )
            }
          />

          <div className="space-y-4 px-5 py-4">
            {!variant ? (
              <p className="text-sm text-slate-500">
                Press Reset demo to create the item and put one unit on the shelf.
              </p>
            ) : (
              <>
                <label className="flex items-start gap-3 rounded-md bg-slate-50 p-3">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={unsafe}
                    disabled={busy}
                    onChange={(event) => setUnsafe(event.target.checked)}
                  />
                  <span className="text-sm">
                    <span className="font-medium text-slate-900">Disable row locking</span>
                    <span className="block text-slate-500">
                      Sends the burst to a deliberately naive endpoint that reads stock, waits, then
                      writes, with no <code>FOR UPDATE</code> anywhere.
                    </span>
                  </span>
                </label>

                <Button className="w-full" disabled={busy} onClick={fire}>
                  {running ? 'Firing' : `Fire ${BURST_SIZE} simultaneous orders`}
                </Button>
              </>
            )}

            {result && (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Stat label="201 created" value={result.created} />
                  <Stat label="409 refused" value={result.rejected} />
                  <Stat label="Other" value={result.other} />
                  <Stat
                    label="Final stock"
                    value={result.finalStock}
                    tone={result.finalStock < 0 ? 'bad' : 'good'}
                  />
                </dl>

                <p className="text-xs text-slate-500">
                  {BURST_SIZE} requests in {result.durationMs} ms.
                </p>

                <div className="max-h-64 overflow-y-auto rounded-md bg-slate-900 p-3 font-mono text-xs text-slate-200">
                  {result.log.map((entry) => (
                    <div key={entry.index}>
                      <span className="text-slate-500">
                        #{String(entry.index + 1).padStart(2, '0')}
                      </span>{' '}
                      <span
                        className={entry.status === 201 ? 'text-emerald-400' : 'text-amber-400'}
                      >
                        {entry.status}
                      </span>{' '}
                      {entry.label}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader title="What is happening" />
          <div className="space-y-3 px-5 py-4 text-sm text-slate-600">
            <p>
              Placing an order reads the quantity on hand, decides whether there is enough, and then
              writes. Those three steps are not one step, and fifty requests arriving together can
              all get between the read and the write of the others.
            </p>
            <p>
              With locking on, the order service takes{' '}
              <code className="text-slate-900">SELECT … FOR UPDATE</code> on the variant row as part
              of the read. The second request blocks until the first commits, and then sees a
              quantity of zero and refuses honestly. One sale, forty-nine clean 409s, stock lands on
              zero.
            </p>
            <p>
              With locking off, every request reads the same 1, every request believes it is
              entitled to it, and every request decrements. Several succeed and the balance goes
              below zero — stock that was sold but never existed.
            </p>
            <p>
              The variant ids are also sorted before locking. Two orders that share items would
              otherwise be able to hold what the other is waiting for, and Postgres would have to
              kill one of them as a deadlock.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const valueClass =
    tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-emerald-600' : 'text-slate-900';

  return (
    <div className="rounded-md bg-slate-50 px-3 py-2">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className={`text-lg font-semibold ${valueClass}`}>{value}</dd>
    </div>
  );
}
