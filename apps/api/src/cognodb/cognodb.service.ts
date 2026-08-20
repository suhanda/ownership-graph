import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import neo4j, { Driver, type Record as Neo4jRecord } from 'neo4j-driver';
import { loadEnv } from '../config/env';
import { API_ERROR_MESSAGE } from '@ownership/shared';
import { classifyDriverError, DatabaseError } from './database.exception';

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
        // Measured cold connect is ~1.5s (ticket 01), so 5s is generous without making a dead
        // database feel like a hung app. connectionTimeout is honoured to the millisecond.
        connectionTimeout: 5_000,
        connectionAcquisitionTimeout: 6_000,
        // CognoDB's free tier caps at 200 connections. One Fly machine with 20 leaves ample
        // headroom, and is more than a burstable 0.5 vCPU instance can usefully serve at once.
        maxConnectionPoolSize: 20,
        // Only applies to executeRead/executeWrite, which read() deliberately does not use.
        // Kept low so it cannot silently stretch a failure if that ever changes.
        maxTransactionRetryTime: 3_000,
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

  /**
   * Runs a read query with parameters. Cypher text is always a literal — never concatenated.
   *
   * Uses `session.run` rather than `executeRead` on purpose. `ServiceUnavailable` is flagged
   * `retriable: true` (ticket 01), so `executeRead` would burn its whole retry window before
   * surfacing anything — turning a dead database into an app that merely appears hung. Failing
   * fast and letting the UI own the retry is both more honest and more responsive.
   */
  async read<T>(
    cypher: string,
    params: Record<string, unknown>,
    map: (record: Neo4jRecord) => T,
  ): Promise<T[]> {
    const session = this.require().session({ defaultAccessMode: neo4j.session.READ });
    try {
      const result = await session.run(cypher, params);
      return result.records.map(map);
    } catch (error) {
      throw new DatabaseError(classifyDriverError(error), error);
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
 * Copy comes from the shared API_ERROR_MESSAGE so the health endpoint, the error responses and the
 * UI all tell the user the same story.
 */
function classify(error: unknown): ConnectionReport {
  const kind = classifyDriverError(error);
  return {
    status: kind === 'database_unreachable' ? 'unreachable' : 'misconfigured',
    detail: API_ERROR_MESSAGE[kind],
  };
}
