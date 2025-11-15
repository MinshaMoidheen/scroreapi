import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';

import { verifyAccessToken } from '@/lib/jwt';
import { logger } from '@/lib/manualLogger';
import Student from '@/models/student';

import type { Request, Response, NextFunction } from 'express';
import type { Types } from 'mongoose';

/**
 * @function authenticateStudent
 * @description Middleware to verify the student's access token from Authorization header.
 *              If the token is valid, it verifies the student exists and is not deleted,
 *              then attaches the student ID to the request object.
 *              Otherwise, it sends an appropriate error response.
 *
 * @param {Request} req - Express request object. Expects a Bearer token in the Authorization header.
 * @param {Response} res - Express response object used to send error responses if authentication fails.
 * @param {NextFunction} next - Express next function to pass control to the next middleware.
 *
 * @returns {void}
 */

const authenticateStudent = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer')) {
    res.status(401).json({
      code: 'AuthenticationError',
      message: 'Access denied, no token provided',
    });
    return;
  }

  // Split out the token from the 'Bearer ' prefix
  const [_, token] = authHeader.split(' ');

  try {
    // Verify the token and extract the userId from the payload
    const jwtPayload = verifyAccessToken(token) as { userId: Types.ObjectId };

    // Verify the student exists and is not deleted
    const student = await Student.findById(jwtPayload.userId)
      .select('_id')
      .lean()
      .exec();

    if (!student) {
      res.status(401).json({
        code: 'AuthenticationError',
        message: 'Student not found or has been deleted',
      });
      return;
    }

    req.studentId = jwtPayload.userId;
    return next();
  } catch (err) {
    if (err instanceof TokenExpiredError) {
      res.status(401).json({
        code: 'AuthenticationError',
        message:
          'Access token has expired, request a new one with refresh token',
      });
      return;
    }

    if (err instanceof JsonWebTokenError) {
      res.status(401).json({
        code: 'AuthenticationError',
        message: 'Access token invalid',
      });
      return;
    }
    // Catch-all for other errors
    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
      error: err,
    });
    logger.error('Error during student authentication', err);
  }
};

export default authenticateStudent;

