import { Injectable } from '@nestjs/common';
import { ActivityType } from '@flowengine/shared';
import { TaskHandler } from './engine.interfaces';

@Injectable()
export class TaskExecutorRegistry {
  private handlers = new Map<ActivityType, TaskHandler>();

  register(type: ActivityType, handler: TaskHandler): void {
    this.handlers.set(type, handler);
  }

  getHandler(type: ActivityType): TaskHandler | undefined {
    return this.handlers.get(type);
  }
}
