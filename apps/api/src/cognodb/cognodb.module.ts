import { Global, Module } from '@nestjs/common';
import { CognoDbService } from './cognodb.service';

@Global()
@Module({ providers: [CognoDbService], exports: [CognoDbService] })
export class CognoDbModule {}
