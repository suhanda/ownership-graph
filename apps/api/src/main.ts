import 'reflect-metadata';
import { loadDotenv } from './config/load-dotenv';

loadDotenv();

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  const env = loadEnv();
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()) });
  await app.listen(env.PORT);
  new Logger('bootstrap').log(`API listening on http://localhost:${env.PORT}`);
}

void bootstrap();
