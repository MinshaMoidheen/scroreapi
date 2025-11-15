import dotenv from 'dotenv';
import type ms from 'ms';

dotenv.config();

const config = {
  PORT: process.env.PORT || 5031,
  NODE_ENV: process.env.NODE_ENV,
  WHITELIST_ORIGINS: [
    'http://localhost:3010',
    // 'https://ydr2.aiims.edu'
  ],
  MONGO_URI: process.env.MONGO_URL,
  LOCAL_MONGO_URI: process.env.LOCAL_MONGO_URL || 'mongodb://localhost:27017',
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  LOG_FILE_MAX_SIZE: process.env.LOG_FILE_MAX_SIZE || '20MB',
  LOG_FILE_MAX_FILES: process.env.LOG_FILE_MAX_FILES || '10',
  LOG_DIR: process.env.LOG_DIR || 'logs',
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET!,
  JWT_REFRESH_SECRET: process.env.JWT_REFRESH_SECRET!,
  ACCESS_TOKEN_EXPIRY: process.env.ACCESS_TOKEN_EXPIRY as ms.StringValue,
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY as ms.StringValue,
  WHITELIST_SUPERADMIN_MAIL: 'basiljijiwork@gmail.com',
  SUPERADMIN_PASSWORD: process.env.SUPERADMIN_PASSWORD || 'basil1',
  SUPERADMIN_MAIL: process.env.SUPERADMIN_MAIL || 'basiljijiwork@gmail.com',
  SUPERADMIN_USERNAME: process.env.SUPERADMIN_USERNAME || 'SUPERADMIN',
  defaultResLimit: 20,
  defaultResOffset: 0,
};

export default config;
