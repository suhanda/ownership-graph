import { Controller, Get } from '@nestjs/common';
import { healthSchema, type Health } from '@ownership/shared';
import { CognoDbService } from '../cognodb/cognodb.service';

@Controller('health')
export class HealthController {
  constructor(private readonly cognodb: CognoDbService) {}

  /**
   * The vertical slice: the web app renders this, so a broken database is visible before any
   * feature is built. Validated against the shared schema on the way out, so the contract cannot
   * drift from what the client expects.
   */
  @Get()
  async check(): Promise<Health> {
    const report = await this.cognodb.check();
    return healthSchema.parse({
      api: 'ok',
      database: report.status,
      boltProtocol: report.boltProtocol,
      serverAgent: report.serverAgent,
      latencyMs: report.latencyMs,
      detail: report.detail,
    });
  }
}
