import type {
  BeneficialOwnersParams,
  GraphPayload,
  HiddenLinkParams,
  NeighbourhoodParams,
  NomineeUnmaskingParams,
  OwnershipCyclesParams,
  ResolveEntityParams,
  SharedRegistrationParams,
  WatchlistControlParams,
} from '@ownership/shared';

/** Rows are query-shaped and passed straight to the findings panel. */
export type Rows = Record<string, unknown>[];

/** A result that can also be drawn: `graph` is the ECharts-ready subgraph for that answer. */
export interface QueryResult {
  rows: Rows;
  graph?: GraphPayload;
}

/**
 * Everything the chat layer is allowed to do to the database. The chat depends on this interface,
 * not on the driver — which keeps the tool definitions testable without a live CognoDB instance,
 * and makes it impossible for the chat to reach a query that isn't in the signature set.
 */
export interface GraphService {
  resolveEntity(params: ResolveEntityParams): Promise<Rows>;
  beneficialOwners(params: BeneficialOwnersParams): Promise<QueryResult>;
  hiddenLink(params: HiddenLinkParams): Promise<QueryResult>;
  ownershipCycles(params: OwnershipCyclesParams): Promise<QueryResult>;
  watchlistControl(params: WatchlistControlParams): Promise<QueryResult>;
  nomineeUnmasking(params: NomineeUnmaskingParams): Promise<QueryResult>;
  sharedRegistration(params: SharedRegistrationParams): Promise<QueryResult>;
  neighbourhood(params: NeighbourhoodParams): Promise<QueryResult>;
  /**
   * Runs model-generated Cypher in a session opened READ-only, so the engine refuses writes
   * regardless of what passed validation. Returns rows only — a generated query has an arbitrary
   * shape, so there is nothing reliable to draw from it.
   */
  runReadOnly(cypher: string, params: Record<string, unknown>): Promise<Rows>;
  /** The induced subgraph over a set of ids: those nodes and every relationship between them. */
  inducedSubgraph(ids: string[]): Promise<QueryResult>;
}
