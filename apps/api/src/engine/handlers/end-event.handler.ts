import { Injectable } from '@nestjs/common';
import { TaskHandler, TaskHandlerResult, TaskExecutionContext } from '../engine.interfaces';

@Injectable()
export class EndEventHandler implements TaskHandler {
  async execute(_context: TaskExecutionContext): Promise<TaskHandlerResult> {
    // End event — token completion and instance check handled by ExecutionEngineService.moveToNext
    return 'completed';
  }
}
