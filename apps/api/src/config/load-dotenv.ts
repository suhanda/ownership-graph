import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as dotenv from 'dotenv';

/**
 * Loaded before anything reads `process.env`. NestJS's ConfigModule initialises too late for the
 * bootstrap-time env validation in main.ts, so the files are read explicitly here.
 * Nearest file wins; real values never live in the repo (see .gitignore).
 */
export function loadDotenv(): void {
  const candidates = [
    resolve(process.cwd(), '.env.local'),
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env.local'),
    resolve(process.cwd(), '../../.env'),
  ];
  for (const path of candidates) {
    if (existsSync(path)) dotenv.config({ path, override: false });
  }
}
