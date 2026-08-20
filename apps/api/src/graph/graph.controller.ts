import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  beneficialOwnersParams,
  hiddenLinkParams,
  neighbourhoodParams,
  nomineeUnmaskingParams,
  ownershipCyclesParams,
  resolveEntityParams,
  sharedRegistrationParams,
  watchlistControlParams,
} from '@ownership/shared';
import type { QueryResult, Rows } from './graph.port';
import { GraphService } from './graph.service';
import { ZodValidationPipe } from './zod.pipe';

/**
 * One endpoint per signature query. The entity id always comes from the path and the knobs from the
 * query string; both are validated against the same shared schemas the chat tools use, so an
 * endpoint and its tool can never disagree about what a parameter means.
 */
@Controller('graph')
export class GraphController {
  constructor(private readonly graph: GraphService) {}

  @Get('entities')
  entities(
    @Query(new ZodValidationPipe(resolveEntityParams)) params: { term: string; limit: number },
  ): Promise<Rows> {
    return this.graph.resolveEntity(params);
  }

  @Get('companies/:id/owners')
  owners(@Param('id') id: string, @Query() query: Record<string, string>): Promise<QueryResult> {
    const params = new ZodValidationPipe(beneficialOwnersParams).transform({
      ...query,
      companyId: id,
    });
    return this.graph.beneficialOwners(params);
  }

  @Get('links')
  links(
    @Query(new ZodValidationPipe(hiddenLinkParams))
    params: {
      fromId: string;
      toId: string;
      maxDepth: number;
    },
  ): Promise<QueryResult> {
    return this.graph.hiddenLink(params);
  }

  @Get('cycles')
  cycles(
    @Query(new ZodValidationPipe(ownershipCyclesParams)) params: { maxDepth: number },
  ): Promise<QueryResult> {
    return this.graph.ownershipCycles(params);
  }

  @Get('watchlist')
  watchlist(
    @Query(new ZodValidationPipe(watchlistControlParams))
    params: {
      watchlistName: string;
      maxDepth: number;
      minPct: number;
      limit: number;
    },
  ): Promise<QueryResult> {
    return this.graph.watchlistControl(params);
  }

  @Get('people/:id/nominee')
  nominee(@Param('id') id: string): Promise<QueryResult> {
    const params = new ZodValidationPipe(nomineeUnmaskingParams).transform({ personId: id });
    return this.graph.nomineeUnmasking(params);
  }

  @Get('companies/:id/shared-registration')
  shared(@Param('id') id: string, @Query() query: Record<string, string>): Promise<QueryResult> {
    const params = new ZodValidationPipe(sharedRegistrationParams).transform({
      ...query,
      companyId: id,
    });
    return this.graph.sharedRegistration(params);
  }

  @Get('nodes/:id/neighbours')
  neighbours(
    @Param('id') id: string,
    @Query() query: Record<string, string>,
  ): Promise<QueryResult> {
    const params = new ZodValidationPipe(neighbourhoodParams).transform({ ...query, id });
    return this.graph.neighbourhood(params);
  }
}
