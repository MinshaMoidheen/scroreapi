import { logger } from '@/lib/manualLogger';
import User from '@/models/user';
import type { Request, Response } from 'express';

const deleteUser = async (req: Request, res: Response): Promise<void> => {
  const currentUserId = req.userId?.toString() || '';
  const targetUserId = req.params.userId;

  try {
    // Get current user
    const currentUser = await User.findOne({
      _id: currentUserId,
      'isDeleted.status': { $ne: true },
    })
      .select('-__v -password -isDeleted -createdAt -updatedAt')
      .lean()
      .exec();

    if (!currentUser) {
      // Log the error
      if (currentUserId) {
        await logger.logError(
          'USER',
          'DELETE',
          'Current user not found',
          currentUserId,
          req,
          { targetUserId }
        );
      }
      res.status(404).json({
        code: 'NotFound',
        message: 'Current user not found',
      });
      return;
    }

    // Get target user
    const targetUser = await User.findOne({
      _id: targetUserId,
      'isDeleted.status': { $ne: true },
    })
      .select('-__v -password')
      .lean()
      .exec();

    if (!targetUser) {
      // Log the error
      if (currentUserId) {
        await logger.logError(
          'USER',
          'DELETE',
          'Target user not found or already deleted',
          currentUserId,
          req,
          { targetUserId }
        );
      }
      res.status(404).json({
        code: 'NotFound',
        message: 'User not found or already deleted',
      });
      return;
    }

    // Prevent self-deletion
    if (currentUserId === targetUserId) {
      // Log the error
      if (currentUserId) {
        await logger.logError(
          'USER',
          'DELETE',
          'Attempted to delete own account',
          currentUserId,
          req,
          { targetUserId }
        );
      }
      res.status(400).json({
        code: 'BadRequest',
        message: 'Cannot delete your own account',
      });
      return;
    }

    // Role-based authorization
    if (currentUser.role === 'admin') {
      // Admin can only delete users
      if (targetUser.role !== 'user') {
        // Log the error
        if (currentUserId) {
          await logger.logError(
            'USER',
            'DELETE',
            `Admin attempted to delete non-user account: ${targetUser.role}`,
            currentUserId,
            req,
            { targetUserId, targetUserRole: targetUser.role }
          );
        }
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Admin users can only delete user accounts',
        });
        return;
      }

    } else if (currentUser.role === 'superadmin') {
      // Validate superadmin access level
      if (currentUser.access !== 'all') {
        res.status(403).json({
          code: 'AccessDenied',
          message: 'Superadmin role must have "all" access',
        });
        return;
      }

      // Superadmin can delete admin and user roles
      if (targetUser.role !== 'admin' && targetUser.role !== 'user') {
        // Log the error
        if (currentUserId) {
          await logger.logError(
            'USER',
            'DELETE',
            `Superadmin attempted to delete invalid role: ${targetUser.role}`,
            currentUserId,
            req,
            { targetUserId, targetUserRole: targetUser.role }
          );
        }
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Superadmin can only delete admin or user accounts',
        });
        return;
      }
    } else {
      // User role cannot delete anyone
      res.status(403).json({
        code: 'AuthorizationError',
        message: 'Insufficient permissions to delete users',
      });
      return;
    }

    // Store user data for logging (targetUser is already a plain object from .lean())
    const userData = targetUser;

    // Perform soft delete
    await User.findByIdAndUpdate(targetUserId, {
      isDeleted: {
        status: true,
        deletedTime: new Date(),
        deletedBy: currentUserId,
      },
    });

    res.status(200).json({
      message: 'User deleted successfully',
      deletedUser: {
        id: targetUser._id,
        username: targetUser.username,
        email: targetUser.email,
        role: targetUser.role,
      },
    });

    // Log the deletion activity
    await logger.logDelete(
      'USER',
      targetUserId,
      userData,
      currentUserId,
      req
    );
  } catch (err) {
    // Log the error
    await logger.logError(
      'USER',
      'DELETE',
      err,
      currentUserId,
      req,
      {
        targetUserId
      }
    );

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
    });
  }
};

export default deleteUser;
