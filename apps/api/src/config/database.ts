/**
 * database.ts
 *
 * MongoDB connection service using Mongoose.
 * Call connect() once at server startup.
 * All models are registered by importing them here so Mongoose
 * registers the schemas before any repository uses them.
 */

import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';

// Register all models by importing them — side-effect imports are intentional
import '../models/Lead.model';
import '../models/Appointment.model';
import '../models/Conversation.model';
import '../models/Business.model';
import '../models/Notification.model';
import '../models/User.model';

const CONNECTION_OPTIONS: mongoose.ConnectOptions = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

/**
 * Connect to MongoDB. Resolves when the connection is ready.
 * Rejects with an error if the URI is missing or the connection fails.
 */
export async function connectDatabase(): Promise<void> {
  if (!env.MONGODB_URI) {
    logger.warn('MONGODB_URI is not set — skipping database connection');
    return;
  }

  try {
    await mongoose.connect(env.MONGODB_URI, CONNECTION_OPTIONS);
    logger.info(`MongoDB connected: ${mongoose.connection.host}`);
  } catch (err) {
    logger.error({ err }, 'MongoDB connection failed');
    throw err;
  }
}

/**
 * Disconnect gracefully. Called during server shutdown.
 */
export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState === 0) return;
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

/** Returns true when Mongoose has an active connection. */
export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export const databaseConfig = {
  uri: env.MONGODB_URI,
  options: CONNECTION_OPTIONS,
} as const;
