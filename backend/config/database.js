import mongoose from 'mongoose';
import env from './env.js';

const listenersBound = { current: false };
let connectPromise = null;

export const sanitizeDatabaseMessage = (error) => {
  const message = error?.message || 'Unknown database error';
  return message.replace(/mongodb(?:\+srv)?:\/\/\S+/gi, 'mongodb://***');
};

const bindConnectionLogs = () => {
  if (listenersBound.current) return;
  listenersBound.current = true;

  mongoose.connection.on('error', (error) => {
    console.error(`[MongoDB] Runtime connection error: ${sanitizeDatabaseMessage(error)}`);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('[MongoDB] Connection lost.');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('[MongoDB] Reconnected.');
  });
};

/**
 * Open the shared MongoDB connection.
 * A custom URI is accepted for tests. Application code uses MONGODB_URI.
 */
export const connectDB = async (customUri = null) => {
  const uri = customUri || process.env.MONGODB_URI || process.env.MONGO_URI || env.MONGODB_URI;

  if (!uri) {
    const error = new Error('MONGODB_URI is not configured.');
    error.code = 'DATABASE_NOT_CONFIGURED';
    throw error;
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  if (!connectPromise) {
    bindConnectionLogs();
    connectPromise = mongoose.connect(uri, {
      maxPoolSize: 50,
      minPoolSize: 0,
      serverSelectionTimeoutMS: 3000,
      socketTimeoutMS: 45000,
    }).then((conn) => {
      console.log(`[MongoDB] Connected to database "${conn.connection.name}".`);
      return conn.connection;
    }).catch((error) => {
      connectPromise = null;
      const wrapped = new Error(sanitizeDatabaseMessage(error));
      wrapped.code = 'DATABASE_UNAVAILABLE';
      throw wrapped;
    });
  }

  return connectPromise;
};

export const disconnectDB = async () => {
  connectPromise = null;
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[MongoDB] Disconnected.');
  }
};

export const getConnectionState = () => {
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting',
  };
  return states[mongoose.connection.readyState] || 'unknown';
};

/**
 * Readiness probe. Attempts one connection when the pool is down so a later
 * retry can recover without restarting the process.
 */
export const isDatabaseReady = async () => {
  try {
    if (mongoose.connection.readyState !== 1) {
      await connectDB();
    }
    if (!mongoose.connection.db) return false;
    await mongoose.connection.db.command({ ping: 1 });
    return true;
  } catch (error) {
    console.error(`[MongoDB] Readiness check failed: ${sanitizeDatabaseMessage(error)}`);
    return false;
  }
};

export default {
  connectDB,
  disconnectDB,
  getConnectionState,
  isDatabaseReady,
  sanitizeDatabaseMessage,
};
