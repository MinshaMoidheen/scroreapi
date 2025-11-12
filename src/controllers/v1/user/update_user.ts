import { logger } from '@/lib/manualLogger';
import User from '@/models/user';

import type { Request, Response } from 'express';
import type { IUser } from '@/models/user';

type UpdateUserRequestBody = Partial<
  Pick<
    IUser,
    'username' | 'email' | 'password' | 'collaboratingCentreId' | 'access'
  >
>;

const updateUser = async (req: Request, res: Response): Promise<void> => {
  const currentUserId = req.userId?.toString() || '';
  const { userId: targetUserId } = req.params;
  const { username, email, password, collaboratingCentreId, access } =
    req.body as UpdateUserRequestBody;

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
          'UPDATE',
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
      .select('+password -__v')
      .exec();

    if (!targetUser) {
      res.status(404).json({
        code: 'NotFound',
        message: 'User not found or already deleted',
      });
      return;
    }

    // Prevent self-update restrictions (users can update themselves)
    const isSelfUpdate = currentUserId === targetUserId;

    // Role-based authorization
    if (currentUser.role === 'admin') {
      // Validate admin access level
      if (currentUser.access !== 'all' && currentUser.access !== 'centre') {
        // Log the error
        if (currentUserId) {
          await logger.logError(
            'USER',
            'UPDATE',
            `Admin has invalid access level: ${currentUser.access}`,
            currentUserId,
            req,
            { targetUserId, adminAccess: currentUser.access }
          );
        }
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Admin role can only have "all" or "centre" access',
        });
        return;
      }

      // Admin can only update users with 'user' role
      if (targetUser.role !== 'user') {
        // Log the error
        if (currentUserId) {
          await logger.logError(
            'USER',
            'UPDATE',
            `Admin attempted to update non-user account: ${targetUser.role}`,
            currentUserId,
            req,
            { targetUserId, targetUserRole: targetUser.role }
          );
        }
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Admin users can only update user accounts',
        });
        return;
      }

      // Check admin's access level to determine centre restrictions
      if (currentUser.access === 'centre') {
        // Admin with 'centre' access can only update users from their own centre
        if (
          currentUser.collaboratingCentreId?.toString() !==
          targetUser.collaboratingCentreId?.toString()
        ) {
          // Log the error
          if (currentUserId) {
            await logger.logError(
              'USER',
              'UPDATE',
              'Admin with centre access attempted to update user from different centre',
              currentUserId,
              req,
              { 
                targetUserId,
                adminCentreId: currentUser.collaboratingCentreId?.toString(),
                targetCentreId: targetUser.collaboratingCentreId?.toString()
              }
            );
          }
          res.status(403).json({
            code: 'AuthorizationError',
            message:
              'Admin with "centre" access can only update users from their own collaborating centre',
          });
          return;
        }
      }
      // Admin with 'all' access can update users from any centre

      // Admin cannot change collaborating centre
      if (
        collaboratingCentreId &&
        collaboratingCentreId.toString() !==
          targetUser.collaboratingCentreId?.toString()
      ) {
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Admin users cannot change collaborating centre',
        });
        return;
      }


    } else if (currentUser.role === 'superadmin') {
      // Validate superadmin access level
      if (currentUser.access !== 'all') {
        // Log the error
        if (currentUserId) {
          await logger.logError(
            'USER',
            'UPDATE',
            `Superadmin has invalid access level: ${currentUser.access}`,
            currentUserId,
            req,
            { targetUserId, superadminAccess: currentUser.access }
          );
        }
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Superadmin role must have "all" access',
        });
        return;
      }

      // Superadmin can update admin and user roles
      if (targetUser.role !== 'admin' && targetUser.role !== 'user') {
        // Log the error
        if (currentUserId) {
          await logger.logError(
            'USER',
            'UPDATE',
            `Superadmin attempted to update invalid role: ${targetUser.role}`,
            currentUserId,
            req,
            { targetUserId, targetUserRole: targetUser.role }
          );
        }
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Superadmin can only update admin or user accounts',
        });
        return;
      }
    } else if (currentUser.role === 'user') {
      // Users can only update themselves
      if (!isSelfUpdate) {
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Users can only update their own account',
        });
        return;
      }

      // Users cannot change their collaborating centre
      if (
        collaboratingCentreId &&
        collaboratingCentreId.toString() !==
          targetUser.collaboratingCentreId?.toString()
      ) {
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Users cannot change their collaborating centre',
        });
        return;
      }
    } else {
      res.status(403).json({
        code: 'AuthorizationError',
        message: 'Insufficient permissions to update users',
      });
      return;
    }

    if (access && targetUser.role === 'admin' && access === 'own') {
      res.status(400).json({
        code: 'BadRequest',
        message:
          'Admin users cannot have own access - only centre or all access',
      });
      return;
    }

    // Store before data for logging
    const beforeData = {
      username: targetUser.username,
      email: targetUser.email,
      role: targetUser.role,
      access: targetUser.access,
      collaboratingCentreId: targetUser.collaboratingCentreId,
    };

    // Apply updates
    // Store old data for logging
    const oldUserData = targetUser.toObject();

    if (username) targetUser.username = username;
    if (email) targetUser.email = email;
    if (password) targetUser.password = password;
    if (collaboratingCentreId)
      targetUser.collaboratingCentreId = collaboratingCentreId;
    if (access) targetUser.access = access;

    await targetUser.save();

    res.status(200).json({
      message: 'User updated successfully',
      user: {
        id: targetUser._id,
        username: targetUser.username,
        email: targetUser.email,
        role: targetUser.role,
        access: targetUser.access,
        collaboratingCentreId: targetUser.collaboratingCentreId,
      },
    });

    // Log the update activity
    await logger.logUpdate(
      'USER',
      targetUserId,
      oldUserData,
      targetUser.toObject(),
      currentUserId,
      Object.keys({ username, email, password, collaboratingCentreId, access }).filter(key => req.body[key] !== undefined),
      req
    );
  } catch (err) {
    // Log the error
    await logger.logError(
      'USER',
      'UPDATE',
      err,
      currentUserId,
      req,
      {
        targetUserId,
        updatedFields: Object.keys({ username, email, password, collaboratingCentreId, access }).filter(key => req.body[key] !== undefined)
      }
    );

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
    });
  }
};

export default updateUser;
