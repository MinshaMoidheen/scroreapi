import { Response, NextFunction } from 'express';
import TeacherSession from '@/models/teacherSession';
import User from '@/models/user';
import Student from '@/models/student';
import type { Request } from 'express';

/**
 * Middleware to check if a teacher user has an active session
 * This should be used on routes that teachers access
 * Note: Session expiration is handled by a cron job (see src/services/sessionExpirationCron.ts)
 * For students, this middleware allows access without session check
 */
const checkTeacherSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const userId = req.userId;

  if (!userId) {
    res.status(401).json({
      code: 'AuthenticationError',
      message: 'User not authenticated',
    });
    return;
  }

  try {
    // First try to find in User collection
    let user = await User.findById(userId)
      .select('role username')
      .lean()
      .exec();

    // If not found in User collection, check Student collection
    if (!user) {
      const student = await Student.findById(userId)
        .select('username')
        .lean()
        .exec();

      if (student) {
        // Student found - allow access without session check
        return next();
      }

      // Neither user nor student found
      res.status(404).json({
        code: 'NotFound',
        message: 'User not found',
      });
      return;
    }

    // Only check TeacherSession for users with role 'user' (teachers)
    if (user.role === 'user') {
      // Check if there's an active TeacherSession for this teacher
      // Active session means: active: true AND no logoutTime/logoutAt set
      const activeSession = await TeacherSession.findOne({
        username: user.username,
        active: true,
        $and: [
          {
            $or: [
              { logoutTime: null },
              { logoutTime: { $exists: false } }
            ]
          },
          {
            $or: [
              { logoutAt: null },
              { logoutAt: { $exists: false } }
            ]
          }
        ]
      }).lean().exec();

      // If no active session found, the teacher has been logged out
      if (!activeSession) {
        res.status(401).json({
          code: 'SessionExpired',
          message: 'Your session has been terminated. Please log in again.',
        });
        return;
      }

      // Check if sessionToken has been invalidated (starts with "INVALIDATED_")
      // This happens when the cron job expires the session
      if (activeSession.sessionToken && activeSession.sessionToken.startsWith('INVALIDATED_')) {
        res.status(401).json({
          code: 'SessionExpired',
          message: 'Your session has expired after 1 hour 15 minutes. Please log in again.',
        });
        return;
      }
    }

    // If user is admin or superadmin, or teacher has active session, allow
    return next();
  } catch (err) {
    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
    });
    console.error('Error checking teacher session:', err);
  }
};

export default checkTeacherSession;

