import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CognoDbModule } from './cognodb/cognodb.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env.local', '.env', '../../.env'] }),
    CognoDbModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
