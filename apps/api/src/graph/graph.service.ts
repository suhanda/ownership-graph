import { Injectable } from '@nestjs/common';
import {
  graphPayloadSchema,
  type BeneficialOwnersParams,
  type GraphPayload,
  type HiddenLinkParams,
  type NeighbourhoodParams,
  type NomineeUnmaskingParams,
  type OwnershipCyclesParams,
  type ResolveEntityParams,
  type SharedRegistrationParams,
  type WatchlistControlParams,
} from '@ownership/shared';
import neo4j from 'neo4j-driver';
import { planOperators, planWrites } from '../chat/cypher-guard';
import { DatabaseError } from '../cognodb/database.exception';
import { CognoDbService } from '../cognodb/cognodb.service';
import type { GraphService as GraphPort, QueryResult, Rows } from './graph.port';
import { toPlain, toPlainRecord } from './plain';
import { QUERIES, type GraphQuery } from './queries';

/** Cypher takes integer parameters as driver Integers, not JS numbers. */
const ints = <T extends Record<string, unknown>>(
  params: T,
  keys: (keyof T)[],
): Record<string, unknown> => {
  const out: Record<string, unknown> = { ...params };
  for (const key of keys) {
    if (typeof params[key] === 'number') out[key as string] = neo4j.int(params[key] as number);
  }
  return out;
};

@Injectable()
export class GraphService implements GraphPort {
  constructor(private readonly cognodb: CognoDbService) {}

  /** A drawable query returns exactly one record holding `rows`, `nodes` and `links`. */
  private async drawable(query: GraphQuery, params: Record<string, unknown>): Promise<QueryResult> {
    const records = await this.cognodb.read(query.cypher, params, (record) => record.toObject());
    const first = records[0];
    if (!first) return { rows: [] };

    const rows = (toPlain(first['rows']) as Rows | null) ?? [];
    const payload: GraphPayload = graphPayloadSchema.parse({
      nodes: ((toPlain(first['nodes']) as unknown[]) ?? []).filter(
        (n): n is Record<string, unknown> => Boolean(n && (n as Record<string, unknown>)['id']),
      ),
      links: ((toPlain(first['links']) as unknown[]) ?? []).filter(
        (l): l is Record<string, unknown> => Boolean(l && (l as Record<string, unknown>)['source']),
      ),
    });
    return { rows, graph: payload };
  }

  /** A tabular query returns one row per record. */
  private async tabular(query: GraphQuery, params: Record<string, unknown>): Promise<Rows> {
    return this.cognodb.read(query.cypher, params, (record) => toPlainRecord(record.toObject()));
  }

  resolveEntity(params: ResolveEntityParams): Promise<Rows> {
    return this.tabular(QUERIES.resolveEntity, ints(params, ['limit']));
  }

  beneficialOwners(params: BeneficialOwnersParams): Promise<QueryResult> {
    return this.drawable(QUERIES.beneficialOwners, ints(params, ['maxDepth']));
  }

  hiddenLink(params: HiddenLinkParams): Promise<QueryResult> {
    return this.drawable(QUERIES.hiddenLink, ints(params, ['maxDepth']));
  }

  ownershipCycles(params: OwnershipCyclesParams): Promise<QueryResult> {
    return this.drawable(QUERIES.ownershipCycles, ints(params, ['maxDepth']));
  }

  watchlistControl(params: WatchlistControlParams): Promise<QueryResult> {
    return this.drawable(QUERIES.watchlistControl, ints(params, ['maxDepth', 'limit']));
  }

  nomineeUnmasking(params: NomineeUnmaskingParams): Promise<QueryResult> {
    return this.drawable(QUERIES.nomineeUnmasking, { ...params });
  }

  sharedRegistration(params: SharedRegistrationParams): Promise<QueryResult> {
    return this.tabular(QUERIES.sharedRegistration, ints(params, ['limit'])).then((rows) => ({
      rows,
    }));
  }

  neighbourhood(params: NeighbourhoodParams): Promise<QueryResult> {
    return this.drawable(QUERIES.neighbourhood, ints(params, ['limit']));
  }

  /**
   * CognoDB does not enforce read-only sessions — a READ session was measured happily running
   * CREATE and DELETE. So the query is planned first and refused if the planner intends any write.
   * This is the actual boundary; the access mode is not one.
   */
  inducedSubgraph(ids: string[]): Promise<QueryResult> {
    return this.drawable(QUERIES.inducedSubgraph, { ids });
  }

  neighbourhoodOf(ids: string[], limit: number): Promise<QueryResult> {
    return this.drawable(QUERIES.neighbourhoodOf, { ids, limit: neo4j.int(limit) });
  }

  async runReadOnly(cypher: string, params: Record<string, unknown>): Promise<Rows> {
    const plan = await this.cognodb.explain(cypher, params);
    const writes = planWrites(planOperators(plan));
    if (writes.length > 0) {
      throw new DatabaseError(
        'invalid_request',
        new Error(`refused write plan: ${writes.join(', ')}`),
      );
    }
    return this.cognodb.read(cypher, params, (record) => toPlainRecord(record.toObject()));
  }
}
