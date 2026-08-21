import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ChatModule } from './chat/chat.module';
import { CognoDbModule } from './cognodb/cognodb.module';
import { GraphModule } from './graph/graph.module';
import { SharedSecretGuard } from './config/shared-secret.guard';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env', '../../.env'] }),
    CognoDbModule,
    GraphModule,
    ChatModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: SharedSecretGuard }],
})
export class AppModule {}
