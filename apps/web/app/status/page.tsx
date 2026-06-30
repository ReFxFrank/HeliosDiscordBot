import Link from 'next/link';
import { fetchRefxStatus, refxStatusEmoji, type RefxStatus } from '@helios/shared';
import { GlassCard } from '../../components/ui/glass-card';

export const dynamic = 'force-dynamic';

const STATUS_URL = process.env.REFX_STATUS_URL;

export default async function StatusPage() {
  let status: RefxStatus | null = null;
  try {
    status = await fetchRefxStatus(STATUS_URL);
  } catch {
    status = null;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">ReFx Hosting Status</h1>
        <Link href="/" className="text-sm text-white/50 hover:text-white/80">
          ← Home
        </Link>
      </div>

      {!status ? (
        <GlassCard className="p-10 text-center text-sm text-white/50">
          The status API is unavailable right now.
        </GlassCard>
      ) : (
        <div className="flex flex-col gap-6">
          <GlassCard className="p-5">
            <p className="text-lg">
              {refxStatusEmoji(status.data.status)} Overall:{' '}
              <span className="font-semibold">{status.data.status}</span>
            </p>
            {status.data.updatedAt && (
              <p className="mt-1 font-mono text-xs text-white/40">
                Updated {new Date(status.data.updatedAt).toLocaleString()}
              </p>
            )}
          </GlassCard>

          {status.data.components.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-white/80">Services</h2>
              <GlassCard className="divide-y divide-white/5 p-0">
                {status.data.components.map((component) => (
                  <div key={component.key} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <span className="text-white/85">{component.name}</span>
                    <span>
                      {refxStatusEmoji(component.status)} {component.status}
                    </span>
                  </div>
                ))}
              </GlassCard>
            </section>
          )}

          {status.data.regions.map((region) => (
            <section key={region.code}>
              <h2 className="mb-2 flex items-center justify-between text-sm font-semibold text-white/80">
                <span>
                  {refxStatusEmoji(region.status)} {region.name}
                </span>
                <span className="font-mono text-xs text-white/40">
                  {region.nodesUp}/{region.nodesTotal} nodes up
                </span>
              </h2>
              <GlassCard className="divide-y divide-white/5 p-0">
                {region.nodes.map((node) => (
                  <div key={node.name} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span className="font-mono text-white/70">{node.name}</span>
                    <span>{refxStatusEmoji(node.status)}</span>
                  </div>
                ))}
              </GlassCard>
            </section>
          ))}

          {status.data.incidents.active.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-[var(--color-warning)]">Active incidents</h2>
              <GlassCard className="flex flex-col gap-2 p-4 text-sm text-white/80">
                {status.data.incidents.active.map((incident, index) => (
                  <p key={incident.id ?? index}>• {incident.title ?? incident.status ?? 'Incident'}</p>
                ))}
              </GlassCard>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
