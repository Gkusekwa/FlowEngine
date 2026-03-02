import { Injectable, Inject } from '@nestjs/common';
import Redis from 'ioredis';
import Redlock, { Lock, ExecutionError } from 'redlock';
import { REDIS_CLIENT } from './redis.constants';

@Injectable()
export class DistributedLockService {
  private redlock: Redlock;

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    this.redlock = new Redlock([redis], {
      retryCount: 10,
      retryDelay: 200,
      retryJitter: 200,
      automaticExtensionThreshold: 500,
    });

    this.redlock.on('error', (error) => {
      if (!(error instanceof ExecutionError)) {
        console.error('Redlock error:', error);
      }
    });
  }

  async withLock<T>(
    resourceKey: string,
    ttlMs: number,
    callback: () => Promise<T>,
  ): Promise<T> {
    let lock: Lock;
    try {
      lock = await this.redlock.acquire([`lock:${resourceKey}`], ttlMs);
    } catch {
      throw new Error(`CONCURRENCY_LOCK_FAILED: Could not acquire lock for ${resourceKey}`);
    }

    try {
      return await callback();
    } finally {
      try {
        await lock.release();
      } catch {
        // Lock may have expired — safe to ignore
      }
    }
  }
}
