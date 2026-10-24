import { Queue, Worker } from 'bullmq';
import { createRedisClient } from '../../config/redis.js';

// Dedicated connection for BullMQ
const queueConnection = createRedisClient();

export const QUEUE_NAMES = {
  ORDER_PROCESSING: 'order-processing',
  KOT_PRINT: 'kot-print',
  OFFLINE_SYNC: 'offline-sync',
};

/**
 * BullMQ Queues backed by Redis
 */
export const orderProcessingQueue = new Queue(QUEUE_NAMES.ORDER_PROCESSING, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export const kotPrintQueue = new Queue(QUEUE_NAMES.KOT_PRINT, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },
});

export const offlineSyncQueue = new Queue(QUEUE_NAMES.OFFLINE_SYNC, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 5000,
    },
  },
});

/**
 * Worker helper factory for creating Redis-backed background job processors
 */
export const createQueueWorker = (queueName, processor, concurrency = 5) => {
  const workerConnection = createRedisClient();
  const worker = new Worker(queueName, processor, {
    connection: workerConnection,
    concurrency,
  });

  worker.on('failed', (job, err) => {
    console.error(`[BullMQ Worker] Job ${job?.id} in queue '${queueName}' failed:`, err.message);
  });

  worker.on('completed', (job) => {
    console.log(`[BullMQ Worker] Job ${job?.id} in queue '${queueName}' completed successfully.`);
  });

  return worker;
};

export default {
  orderProcessingQueue,
  kotPrintQueue,
  offlineSyncQueue,
  createQueueWorker,
  QUEUE_NAMES,
};
