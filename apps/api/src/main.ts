import 'reflect-metadata';
import { loadDotenv } from './config/load-dotenv';

loadDotenv();

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DatabaseExceptionFilter, HttpExceptionShapeFilter } from './cognodb/database.exception';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  // Deliberately no connectivity check at boot. A container that refuses to start crash-loops on
  // Fly, and the reviewer sees the platform's error page instead of ours. The API starts
  // degraded and tells the truth on /health.
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new DatabaseExceptionFilter(), new HttpExceptionShapeFilter());
  app.enableCors({ origin: env.CORS_ORIGIN, credentials: false });
  new Logger('bootstrap').log(`CORS allows: ${env.CORS_ORIGIN.join(', ')}`);
  await app.listen(env.PORT);
  new Logger('bootstrap').log(`API listening on http://localhost:${env.PORT}`);
}

void bootstrap();
