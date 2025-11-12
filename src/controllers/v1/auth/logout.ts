import { logger } from '@\/lib\/manualLogger';
import config from '@/config';

import Token from '@/models/token';
import TeacherSession from '@/models/teacherSession';
import User from '@/models/user';

import type { Request, Response } from 'express';

/**
 * Logout the current authenticated user
 */
const logout = async (req: Request, res: Response): Promise<void> => {
  const userId = req.userId;

  try {
    const refreshToken = req.cookies.refreshToken as string;

    if (refreshToken) {
      await Token.deleteOne({ token: refreshToken });
    }

    // End the teacher session if there is one
    if (userId) {
      const currentTime = new Date();
      await TeacherSession.updateMany(
        { username: userId, active: true },
        { $set: { 
          active: false, 
          logoutAt: currentTime,
          logoutTime: currentTime
        } },
      );
    }

    // Clear the refresh token cookie
    res.clearCookie('refreshToken', {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    res.sendStatus(204);

    // Log the logout activity
    if (userId) {
      await logger.logLogout(userId, req);
    }
  } catch (err) {
    // Log the error
    if (userId) {
      await logger.logError('AUTH', 'LOGOUT', err, userId, req);
    }

    res.status(500).json({
      code: 'Server Error',
      message: 'Internal server error',
      error: err,
    });
  }
};

/**
 * Logout another user (admin/superadmin only)
 * - Superadmin can logout anyone (including other superadmins and admins)
 * - Admin can logout users and other admins (but not superadmins)
 */
const logoutUser = async (req: Request, res: Response): Promise<void> => {
  const currentUserId = req.userId;
  const targetUserId = req.params.userId;

  try {
    // Get current user info
    const currentUser = await User.findById(currentUserId)
      .select('role')
      .lean()
      .exec();

    if (!currentUser) {
      res.status(404).json({
        code: 'Not Found',
        message: 'Current user not found',
      });
      return;
    }

    // Get target user info
    const targetUser = await User.findById(targetUserId)
      .select('role username email')
      .lean()
      .exec();

    if (!targetUser) {
      res.status(404).json({
        code: 'Not Found',
        message: 'Target user not found',
      });
      return;
    }

    // Authorization check
    if (currentUser.role === 'superadmin') {
      // Superadmin can logout anyone
    } else if (currentUser.role === 'admin') {
      // Admin can logout users and other admins, but not superadmins
      if (targetUser.role === 'superadmin') {
        res.status(403).json({
          code: 'Authorization Error',
          message: 'You cannot logout a superadmin',
        });
        return;
      }
    } else {
      // Regular users cannot logout others
      res.status(403).json({
        code: 'Authorization Error',
        message: 'You do not have permission to logout other users',
      });
      return;
    }

    // Delete all tokens for the target user
    await Token.deleteMany({ userId: targetUserId });

    // End all active teacher sessions for the target user
    // Note: username field in TeacherSession stores the username string, not the userId
    // Update sessions that are active OR don't have logoutTime/logoutAt set
    // Also invalidate the sessionToken to prevent further API access
    const currentTime = new Date();
    const invalidatedToken = `INVALIDATED_${Date.now()}_${targetUser._id}`;
    const updateResult = await TeacherSession.updateMany(
      { 
        username: targetUser.username,
        $or: [
          { active: true },
          { logoutTime: { $exists: false } },
          { logoutTime: null },
          { logoutAt: { $exists: false } },
          { logoutAt: null }
        ]
      },
      { $set: { 
        active: false, 
        logoutAt: currentTime,
        logoutTime: currentTime,
        sessionToken: invalidatedToken // Invalidate session token
      } },
    );

    // Log the update result for debugging
    if (updateResult.matchedCount > 0) {
      console.log(`Updated ${updateResult.matchedCount} teacher session(s) for user ${targetUser.username}`);
    }

    res.status(200).json({
      code: 'Success',
      message: 'User logged out successfully',
      targetUser: {
        username: targetUser.username,
        email: targetUser.email,
        role: targetUser.role,
      },
    });

    // Log the logout activity (by admin/superadmin)
    if (currentUserId && targetUserId) {
      await logger.logLogout(targetUserId, req);
    }
  } catch (err) {
    // Log the error
    if (currentUserId) {
      await logger.logError('AUTH', 'LOGOUT_USER', err, currentUserId, req);
    }

    res.status(500).json({
      code: 'Server Error',
      message: 'Internal server error',
      error: err,
    });
  }
};

export default logout;
export { logoutUser };
