import { Injectable, Logger } from '@nestjs/common';

/**
 * The demo is public, runs on a real API key, and has to stay live until the assignment is reviewed.
 * Two ceilings guard it: a per-IP rate limit against a single impatient visitor, and a daily token
 * budget against sustained traffic. When the budget is spent the chat disables itself and the graph
 * keeps working — a quiet chat is far better than a demo that looks broken.
 *
 * In-memory on purpose: the API is one long-running container (see docs/hosting.md), so there is no
 * second instance to share state with, and a Redis dependency for a demo would be theatre.
 */
@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  private readonly dailyTokenBudget = Number(process.env['CHAT_DAILY_TOKEN_BUDGET'] ?? 300_000);
  private readonly requestsPerWindow = Number(process.env['CHAT_RATE_LIMIT'] ?? 8);
  private readonly windowMs = 60_000;

  private spentToday = 0;
  private day = new Date().toISOString().slice(0, 10);
  private readonly hits = new Map<string, number[]>();

  private rollOver(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.day) {
      this.logger.log(`Daily chat budget reset (spent ${this.spentToday} tokens on ${this.day})`);
      this.day = today;
      this.spentToday = 0;
    }
  }

  budgetExhausted(): boolean {
    this.rollOver();
    return this.spentToday >= this.dailyTokenBudget;
  }

  /** Sliding window, so a burst cannot be laundered across a fixed boundary. */
  rateLimited(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    if (recent.length >= this.requestsPerWindow) {
      this.hits.set(key, recent);
      return true;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5_000) this.hits.clear(); // crude ceiling; this is a demo, not a CDN
    return false;
  }

  record(inputTokens: number, outputTokens: number): void {
    this.rollOver();
    this.spentToday += inputTokens + outputTokens;
  }

  get remaining(): number {
    this.rollOver();
    return Math.max(0, this.dailyTokenBudget - this.spentToday);
  }
}
