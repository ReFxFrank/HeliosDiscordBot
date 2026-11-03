import { createServer } from 'node:http';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { env } from '../env';
import { logger } from '../logger';

/** Prometheus registry + bot metrics (§5.7). One registry per shard process. */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const guildGauge = new Gauge({
  name: 'refx_shard_guilds',
  help: 'Number of guilds on this shard',
  registers: [registry],
});

export const commandCounter = new Counter({
  name: 'refx_commands_total',
  help: 'Slash commands processed',
  labelNames: ['command', 'status'] as const,
  registers: [registry],
});

export const commandLatency = new Histogram({
  name: 'refx_command_latency_seconds',
  help: 'Slash command execution latency',
  labelNames: ['command'] as const,
  registers: [registry],
});

/**
 * Start a per-shard /metrics + /health HTTP server. Each shard binds
 * METRICS_PORT + shardId to avoid port collisions. Returns a stopper, or null
 * if metrics are disabled. Bind failures are logged, never fatal.
 */
export function startMetricsServer(shardId: number): (() => Promise<void>) | null {
  if (!env.METRICS_ENABLED) return null;
  const port = env.METRICS_PORT + shardId;

  const server = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'text/plain' }).end('ok');
      return;
    }
    if (req.url === '/metrics') {
      registry
        .metrics()
        .then((body) => {
          res.writeHead(200, { 'Content-Type': registry.contentType }).end(body);
        })
        .catch(() => res.writeHead(500).end());
      return;
    }
    res.writeHead(404).end();
  });

  server.on('error', (err) => logger.warn({ err, port }, 'Metrics server error'));
  server.listen(port, () => logger.info({ port }, 'Metrics server listening'));

  return () =>
    new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
}
