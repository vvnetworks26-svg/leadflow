/**
 * ai/pipeline/redisConnection.ts
 *
 * Shared Redis connection factory for the BullMQ conversation-summary
 * queue + worker. Queue and Worker each need their own ioredis instance
 * (BullMQ does not support sharing one connection between them) — this
 * factory just keeps the connection options in one place.
 *
 * maxRetriesPerRequest: null is required by BullMQ for the blocking
 * connections Workers use internally — confirmed directly from BullMQ's
 * source (classes/redis-connection.js), not assumed.
 */

import IORedis from 'ioredis';
import { env } from '../../config/env';

export function createRedisConnection(): IORedis {
  return new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
}
