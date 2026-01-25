/**
 * Redis Configuration dla BullMQ
 */

import { Redis } from 'ioredis';

const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  maxRetriesPerRequest: null, // Wymagane przez BullMQ
};

let redisConnection: Redis | null = null;

export function createRedisConnection(): Redis {
  if (!redisConnection) {
    redisConnection = new Redis(redisConfig);

    redisConnection.on('connect', () => {
      console.log('[Redis] Connected');
    });

    redisConnection.on('error', (err) => {
      console.error('[Redis] Error:', err);
    });
  }

  return redisConnection;
}

export function getRedisConnection(): Redis {
  if (!redisConnection) {
    return createRedisConnection();
  }
  return redisConnection;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
  }
}

export { redisConfig };
