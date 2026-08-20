import { Module } from '@nestjs/common';
import { GraphModule } from '../graph/graph.module';
import { BudgetService } from './budget.service';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [GraphModule],
  controllers: [ChatController],
  providers: [ChatService, BudgetService],
})
export class ChatModule {}
