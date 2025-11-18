import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

import { verifyRefreshToken, generateAccessToken } from '@/lib/jwt';
import { logger } from '@\/lib\/manualLogger';
import activityLogger from '@/utils/logger';

import Token from '@/models/token';

import type { Request, Response } from 'express';
import { Types } from 'mongoose';

const refreshToken = async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  const refreshTokenValue = req.cookies.refreshToken as string;
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent');

  logger.info('Token refresh attempt started', {
    ip: clientIP,
    userAgent,
    hasRefreshToken: !!refreshTokenValue,
    timestamp: new Date().toISOString()
  });

  try {
    if (!refreshTokenValue) {
      logger.warn('Token refresh failed - no refresh token provided', {
        ip: clientIP,
        userAgent,
        duration: Date.now() - startTime
      });

      res.status(401).json({
        code: 'AuthenticationError',
        message: 'No refresh token provided',
      });
      return;
    }

    const tokenExists = await Token.exists({
      token: refreshTokenValue,
    });

    if (!tokenExists) {
      logger.warn('Token refresh failed - invalid refresh token', {
        ip: clientIP,
        userAgent,
        token: refreshTokenValue,
        duration: Date.now() - startTime
      });

      res.status(401).json({
        code: 'AuthenticationError',
        message: 'Invalid refresh token',
      });
      return;
    }

    // Verify Refresh Token
    const jwtPayload = verifyRefreshToken(refreshTokenValue) as {
      userId: Types.ObjectId;
      type?: 'student' | 'user';
    };

    // Preserve the token type (student or user) when refreshing
    const accessToken = generateAccessToken(jwtPayload.userId, jwtPayload.type);

    logger.info('Token refresh successful', {
      userId: jwtPayload.userId,
      ip: clientIP,
      userAgent,
      duration: Date.now() - startTime,
      timestamp: new Date().toISOString()
    });

    res.status(200).json({
      accessToken,
    });

  } catch (err) {
    const duration = Date.now() - startTime;

    if (err instanceof TokenExpiredError) {
      logger.warn('Token refresh failed - refresh token expired', {
        ip: clientIP,
        userAgent,
        token: refreshTokenValue,
        duration,
        timestamp: new Date().toISOString()
      });

      res.status(401).json({
        code: 'AuthenticationError',
        message: 'Refresh token has expired, please login again',
      });
      return;
    }

    if (err instanceof JsonWebTokenError) {
      logger.warn('Token refresh failed - invalid JWT', {
        ip: clientIP,
        userAgent,
        token: refreshTokenValue,
        error: err.message,
        duration,
        timestamp: new Date().toISOString()
      });

      res.status(401).json({
        code: 'AuthenticationError',
        message: 'Invalid refresh token',
      });
      return;
    }

    logger.error('Token refresh error occurred', {
      ip: clientIP,
      userAgent,
      token: refreshTokenValue,
      error: err instanceof Error ? err.message : 'Unknown error',
      stack: err instanceof Error ? err.stack : undefined,
      duration,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
      error: err,
    });
  }
};

export default refreshToken;
