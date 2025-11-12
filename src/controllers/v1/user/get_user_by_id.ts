import { logger } from '@\/lib\/manualLogger';
import ControllerLogger from '@/utils/controllerLogger';

import User from '@/models/user';
import type { Request, Response } from 'express';

const getUserById = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  ControllerLogger.logStart(req, 'Get User By ID', 'baseline', {
    userId: req.userId?.toString() 
  });

  try {
    const userId = req.params.userId;
    const currentUserId = req.userId;

    const currentUser = await User.findOne({
      _id: currentUserId,
      'isDeleted.status': { $ne: true },
    })
      .select('-__v -password -isDeleted -createdAt -updatedAt')
      .lean()
      .exec();

    if (!currentUser) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Current user not found',
      });
      return;
    }

    const user = await User.findOne({
      _id: userId,
      'isDeleted.status': { $ne: true },
    })
      .select('-__v')
      .lean()
      .exec();

    if (!user) {
      res.status(404).json({
        code: 'NotFound',
        message: 'User not found',
      });
      return;
    }

    if (currentUser.role === 'admin') {
      // Validate admin access level
      if (currentUser.access !== 'all' && currentUser.access !== 'centre') {
        logger.warn(`${currentUser.username} admin has invalid access level`, {
          adminUserId: currentUserId,
          adminAccess: currentUser.access,
          adminEmail: currentUser.email,
        });
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Admin role can only have "all" or "centre" access',
        });
        return;
      }

      if (user.role !== 'user') {
        logger.warn(
          `${currentUser.username} admin attempted to access non-user account`,
          {
            adminUserId: currentUserId,
            targetUserId: userId,
            targetUserRole: user.role,
            adminEmail: currentUser.email,
          },
        );
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Admin users can only access user accounts',
        });
        return;
      }

      // Check admin's access level to determine centre restrictions
      if (currentUser.access === 'centre') {
        // Admin with 'centre' access can only access users from their own centre
        if (
          currentUser.collaboratingCentreId?.toString() !==
          user.collaboratingCentreId?.toString()
        ) {
          logger.warn(
            `${currentUser.username} admin with centre access attempted to access user from different collaborating centre`,
            {
              adminUserId: currentUserId,
              adminAccess: currentUser.access,
              adminCollaboratingCentre: currentUser.collaboratingCentreId,
              targetUserId: userId,
              targetUserCollaboratingCentre: user.collaboratingCentreId,
              adminEmail: currentUser.email,
            },
          );
          res.status(403).json({
            code: 'AuthorizationError',
            message:
              'Admin with "centre" access can only access users from their own collaborating centre',
          });
          return;
        }
      }
      // Admin with 'all' access can access users from any centre
    } else if (currentUser.role === 'superadmin') {
      // Validate superadmin access level
      if (currentUser.access !== 'all') {
        logger.warn(
          `${currentUser.username} superadmin has invalid access level`,
          {
            superadminUserId: currentUserId,
            superadminAccess: currentUser.access,
            superadminEmail: currentUser.email,
          },
        );
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Superadmin role must have "all" access',
        });
        return;
      }

      if (user.role !== 'admin' && user.role !== 'user') {
        logger.warn(
          `${currentUser.username} superadmin attempted to access role other than admin or user`,
          {
            superadminUserId: currentUserId,
            targetUserId: userId,
            targetUserRole: user.role,
            superadminEmail: currentUser.email,
          },
        );
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Cannot access role other than admin or user',
        });
        return;
      }
    }

    res.status(200).json({
      user,
    });

    ControllerLogger.logSuccess(req, 'Get User By ID', 'baseline', {
    userId: req.userId?.toString() ,
    
        requestedBy: currentUser.role,
        requestedByUserId: currentUserId,
        targetUserId: userId,
        targetUserRole: user.role
      
  });
  } catch (err) {
    ControllerLogger.logError(req, 'Get User By ID', 'user', err, {
      userId: req.userId?.toString(),
      targetUserId: req.params.userId
    });

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
      error: err,
    });
  }
};

export default getUserById;
