import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import compression from 'compression';
import fileUpload from 'express-fileupload';
import path from 'path';

import type { CorsOptions } from 'cors';

import config from '@/config';
import limiter from '@/lib/express_rate_limit';
import { connectToDatabase, connectToLogDatabase, disconnectFromDatabase } from '@/lib/mongoose';
import { logger } from '@/lib/manualLogger';
import { requestLogger } from '@/middlewares/requestLogger';

import v1Routes from '@/routes/v1';
import { generateSuperAdminAccount } from './utils';
import { startSessionExpirationCron } from '@/services/sessionExpirationCron';

const app = express();

const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (
      config.NODE_ENV === 'development' ||
      !origin ||
      config.WHITELIST_ORIGINS.includes(origin)
    ) {
      callback(null, true);
    } else {
      callback(
        new Error(`CORS Error: ${origin} is not allowed by CORS`),
        false,
      );
      logger.warn(`CORS Error: ${origin} is not allowed by CORS`);
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

// Increase body size limit to handle large rrweb session data
app.use(express.json({ limit: '50mb' }));

app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(cookieParser());

app.use(helmet());

app.use(limiter);

app.use(compression({ threshold: 1024 }));

// Request logging middleware
app.use(requestLogger);

// File upload middleware
app.use(
  fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
    abortOnLimit: true,
    responseOnLimit: 'File size limit has been reached',
    createParentPath: true,
    useTempFiles: false, // Keep files in memory for processing
  }),
);

// Serve static files from uploads directory with CORS headers
app.use('/uploads', (req, res, next) => {
  // Set CORS headers for static files
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Range');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type, Accept-Ranges');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
}, express.static(path.join(process.cwd(), 'uploads')));

(async () => {
  try {
    await connectToDatabase();
    await connectToLogDatabase();
    await generateSuperAdminAccount();
    
    // Start the cron job for checking expired teacher sessions
    startSessionExpirationCron();
    
    app.use('/api/v1', v1Routes);

    app.listen(config.PORT, () => {
      logger.info(`Server is running on port http://localhost:${config.PORT}`);
    });
  } catch (err) {
    logger.warn('Failed to start server', err);

    if (config.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
})();

const handleServerShutdown = async () => {
  try {
    await disconnectFromDatabase();
    logger.warn('Server SHUTDOWN');
    process.exit(0);
  } catch (err) {
    logger.error('Error during server shutdown:', err);
    process.exit(1);
  }
};

process.on('SIGTERM', handleServerShutdown);
process.on('SIGINT', handleServerShutdown);
