import jwt from 'jsonwebtoken';

import config from '@/config';

import { Types } from 'mongoose';

export const generateAccessToken = (userId: Types.ObjectId, type?: 'student' | 'user'): string => {
  const payload: { userId: Types.ObjectId; type?: string } = { userId };
  if (type) {
    payload.type = type;
  }
  return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
    expiresIn: config.ACCESS_TOKEN_EXPIRY,
    subject: 'access', // Changed from 'accessApi' to 'access' to match streaming server expectations
  });
};

export const generateRefreshToken = (userId: Types.ObjectId, type?: 'student' | 'user'): string => {
  const payload: { userId: Types.ObjectId; type?: string } = { userId };
  if (type) {
    payload.type = type;
  }
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.REFRESH_TOKEN_EXPIRY,
    subject: 'refreshToken',
  });
};

export const verifyAccessToken = (token: string) => {
  return jwt.verify(token, config.JWT_ACCESS_SECRET);
};

export const verifyRefreshToken = (token: string) => {
  return jwt.verify(token, config.JWT_REFRESH_SECRET);
};
