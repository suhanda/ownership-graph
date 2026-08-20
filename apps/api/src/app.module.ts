import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CognoDbModule } from './cognodb/cognodb.module';
import { GraphModule } from './graph/graph.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env', '../../.env'] }),
    CognoDbModule,
    GraphModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
