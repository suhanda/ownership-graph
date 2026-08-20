import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import neo4j, { Driver, type Record as Neo4jRecord } from 'neo4j-driver';
import { loadEnv } from '../config/env';

/** The three honest states from ticket 01 — the driver cannot distinguish more than this. */
export type DatabaseStatus = 'reachable' | 'unreachable' | 'misconfigured';

export interface ConnectionReport {
  status: DatabaseStatus;
  boltProtocol?: string;
  serverAgent?: string;
  latencyMs?: number;
  detail?: string;
}

/**
 * Owns the single long-lived driver. The driver holds a connection pool over Bolt, which is why
 * the API runs as a container rather than as serverless functions.
 */
@Injectable()
export class CognoDbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CognoDbService.name);
  private driver: Driver | null = null;

  onModuleInit(): void {
    const env = loadEnv();
    this.driver = neo4j.driver(
      env.COGNODB_URI,
      neo4j.auth.basic(env.COGNODB_USER, env.COGNODB_PASSWORD),
      {
        connectionTimeout: 8_000,
        connectionAcquisitionTimeout: 10_000,
        maxConnectionPoolSize: 20,
        maxTransactionRetryTime: 6_000,
      },
    );
    this.logger.log('CognoDB driver created (connection is established lazily)');
  }

  async onModuleDestroy(): Promise<void> {
    await this.driver?.close();
    this.driver = null;
  }

  private require(): Driver {
    if (!this.driver) throw new Error('CognoDB driver is not initialised');
    return this.driver;
  }

  /** Runs a read query with parameters. Cypher text is always a literal — never built by concatenation. */
  async read<T>(
    cypher: string,
    params: Record<string, unknown>,
    map: (record: Neo4jRecord) => T,
  ): Promise<T[]> {
    const session = this.require().session({ defaultAccessMode: neo4j.session.READ });
    try {
      const result = await session.run(cypher, params);
      return result.records.map(map);
    } finally {
      await session.close();
    }
  }

  async check(): Promise<ConnectionReport> {
    const startedAt = Date.now();
    try {
      const info = await this.require().getServerInfo();
      return {
        status: 'reachable',
        serverAgent: info.agent,
        boltProtocol: String(info.protocolVersion),
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      return { ...classify(error), latencyMs: Date.now() - startedAt };
    }
  }
}

/**
 * Bad hostname, refused connection and network timeout are byte-identical `ServiceUnavailable`
 * errors — measured in ticket 01 — so the API must not pretend to diagnose which one it is.
 * Ticket 09 refines what the UI does with each state.
 */
function classify(error: unknown): ConnectionReport {
  const code = (error as { code?: string } | null)?.code;
  if (code === 'Neo.ClientError.Security.Unauthorized') {
    return {
      status: 'misconfigured',
      detail: 'Authentication failed — check COGNODB_USER and COGNODB_PASSWORD.',
    };
  }
  if (code === 'ServiceUnavailable') {
    return {
      status: 'unreachable',
      detail: 'Database is unreachable. The URI may be wrong, or the instance may be down.',
    };
  }
  return {
    status: 'misconfigured',
    detail: (error as Error | null)?.message ?? 'Unknown driver error.',
  };
}
