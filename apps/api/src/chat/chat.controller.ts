import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import { chatRequestSchema, type ChatEvent, type ChatStatus } from '@ownership/shared';
import type { Request, Response } from 'express';
import { ZodValidationPipe } from '../graph/zod.pipe';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('status')
  status(): ChatStatus {
    return this.chat.status();
  }

  /**
   * Server-Sent Events rather than a JSON response: a turn may run several tools, and each result
   * repaints the chart the moment it lands instead of after the whole answer is composed.
   */
  @Post()
  async ask(
    @Body(new ZodValidationPipe(chatRequestSchema))
    body: { message: string; history: { role: 'user' | 'assistant'; content: string }[] },
    @Req() request: Request,
    @Res() response: Response,
  ): Promise<void> {
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    // Proxies that buffer would defeat the point of streaming.
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();

    const emit = (event: ChatEvent): void => {
      response.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    const key = request.ip ?? request.socket.remoteAddress ?? 'unknown';
    let closed = false;
    request.on('close', () => {
      closed = true;
    });

    await this.chat.run(body, key, (event) => {
      if (!closed) emit(event);
    });
    response.end();
  }
}
