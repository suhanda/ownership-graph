import { fetchHealth } from '@/lib/api';

/**
 * Scaffold vertical slice: a Server Component calls the NestJS API, which pings CognoDB.
 * If this page renders "reachable", the whole chain — workspace, shared schemas, Nest DI,
 * driver, env config, CORS — is wired correctly.
 */
export default async function Page() {
  const health = await fetchHealth();
  const failed = 'error' in health;
  const connected = !failed && health.database === 'reachable';

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '4rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem', margin: '0 0 0.25rem', letterSpacing: '-0.02em' }}>
        Ownership Graph
      </h1>
      <p style={{ color: 'var(--muted)', margin: '0 0 2rem' }}>
        Trace who really owns a company, through every layer.
      </p>

      <section
        style={{
          border: '1px solid var(--line)',
          borderRadius: 10,
          padding: '1.25rem',
          background: 'color-mix(in srgb, var(--bg) 60%, transparent)',
        }}
      >
        <h2
          style={{
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--muted)',
            margin: '0 0 0.75rem',
          }}
        >
          Connection
        </h2>
        {failed ? (
          <p style={{ margin: 0, color: 'var(--bad)' }}>{health.error}</p>
        ) : (
          <dl
            style={{
              display: 'grid',
              gridTemplateColumns: 'auto 1fr',
              gap: '0.4rem 1.25rem',
              margin: 0,
            }}
          >
            <dt style={{ color: 'var(--muted)' }}>Database</dt>
            <dd style={{ margin: 0, color: connected ? 'var(--ok)' : 'var(--bad)' }}>
              {health.database}
            </dd>
            {health.serverAgent ? (
              <>
                <dt style={{ color: 'var(--muted)' }}>Server</dt>
                <dd style={{ margin: 0 }}>{health.serverAgent}</dd>
                <dt style={{ color: 'var(--muted)' }}>Bolt</dt>
                <dd style={{ margin: 0 }}>{health.boltProtocol}</dd>
                <dt style={{ color: 'var(--muted)' }}>Latency</dt>
                <dd style={{ margin: 0 }}>{health.latencyMs} ms</dd>
              </>
            ) : null}
            {health.detail ? (
              <>
                <dt style={{ color: 'var(--muted)' }}>Detail</dt>
                <dd style={{ margin: 0, color: 'var(--bad)' }}>{health.detail}</dd>
              </>
            ) : null}
          </dl>
        )}
      </section>
    </main>
  );
}
