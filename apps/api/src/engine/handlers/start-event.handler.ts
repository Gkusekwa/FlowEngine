import { Injectable } from '@nestjs/common';
import { TaskHandler, TaskHandlerResult, TaskExecutionContext } from '../engine.interfaces';

@Injectable()
export class StartEventHandler implements TaskHandler {
  async execute(_context: TaskExecutionContext): Promise<TaskHandlerResult> {
    // Start event is a pass-through — immediately completed
    return 'completed';
  }
}
