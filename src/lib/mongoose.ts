import mongoose from 'mongoose';

import config from '@/config';
import { logger } from '@/lib/manualLogger';

import { ConnectOptions } from 'mongoose';

const clientOptions: ConnectOptions = {
  dbName: 'sensei',
};

const logClientOptions: ConnectOptions = {
  dbName: 'sensei_logs',
};

// Main database connection
let mainConnection: typeof mongoose;

// Logging database connection
let logConnection: mongoose.Connection;

export const connectToDatabase = async (): Promise<void> => {
  if (!config.MONGO_URI) {
    throw new Error('MONGO_URL is not defined in the configuration');
  }
  try {
    // Connect to main database
    mainConnection = await mongoose.connect(config.MONGO_URI, clientOptions);
    logger.info('MongoDB connected successfully', {
      uri: config.MONGO_URI,
      options: clientOptions,
    });
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }
    logger.error('Error connecting to database:', err);
  }
};

export const connectToLogDatabase = async (): Promise<void> => {
  if (!config.LOCAL_MONGO_URI) {
    throw new Error('LOCAL_MONGO_URI is not defined in the configuration');
  }
  try {
    // Create a separate connection for logs using local MongoDB
    logConnection = mongoose.createConnection(config.LOCAL_MONGO_URI, logClientOptions);
    logger.info('MongoDB Log Database connected successfully to local instance', {
      uri: config.LOCAL_MONGO_URI,
      options: logClientOptions,
    });
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }
    logger.error('Error connecting to log database:', err);
  }
};

export const getLogConnection = (): mongoose.Connection => {
  if (!logConnection) {
    throw new Error('Log database connection not established');
  }
  return logConnection;
};

export const disconnectFromDatabase = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    logger.info('Disconnected from the database successfully.', {
      uri: config.MONGO_URI,
      options: clientOptions,
    });
  } catch (err) {
    if (err instanceof Error) {
      throw new Error(err.message);
    }

    logger.error('Error disconnecting from the database:', err);
  }
};
