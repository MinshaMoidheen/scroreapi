import { logger } from '@\/lib\/manualLogger';
import ControllerLogger from '@/utils/controllerLogger';

import User from '@/models/user';
import type { Request, Response } from 'express';

const getUserByCollaboratingCentre = async (
  req: Request,
  res: Response,
): Promise<void> => {
  const startTime = Date.now();
  ControllerLogger.logStart(req, 'Get Users By Collaborating Centre', 'baseline', {
    userId: req.userId?.toString() 
  });

  try {
    const collaboratingCentreId = req.params.collaboratingCentreId;
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

    // Build filter based on user role and access
    let userFilter: any = {
      collaboratingCentreId,
      'isDeleted.status': { $ne: true },
    };

    if (currentUser.role === 'superadmin') {
      // Validate superadmin access level
      if (currentUser.access !== 'all') {
        res.status(403).json({
          code: 'AccessDenied',
          message: 'Superadmin role must have "all" access',
        });
        return;
      }

      // Superadmin can get admin and user roles from any centre
      userFilter.role = { $in: ['admin', 'user'] };
    } else if (currentUser.role === 'admin') {
      // Check admin's access level to determine allowed operations
      if (currentUser.access === 'all') {
        // Admin with 'all' access can get users from any collaborating centre
        userFilter.role = 'user';
      } else if (currentUser.access === 'centre') {
        // Admin with 'centre' access can only get users from their own collaborating centre
        if (
          currentUser.collaboratingCentreId?.toString() !==
          collaboratingCentreId
        ) {
          logger.warn(
            `${currentUser.username} admin with centre access attempted to access users from different collaborating centre`,
            {
              adminUserId: currentUserId,
              adminAccess: currentUser.access,
              adminCollaboratingCentre: currentUser.collaboratingCentreId,
              requestedCollaboratingCentre: collaboratingCentreId,
              adminEmail: currentUser.email,
            },
          );
          res.status(403).json({
            code: 'AccessDenied',
            message:
              'Admin with "centre" access can only access users from their own collaborating centre',
          });
          return;
        }
        userFilter.role = 'user';
      } else {
        res.status(403).json({
          code: 'AccessDenied',
          message: 'Admin role can only have "all" or "centre" access',
        });
        return;
      }
    } else {
      // Regular users cannot access this endpoint
      res.status(403).json({
        code: 'AuthorizationError',
        message:
          'Insufficient permissions to access users by collaborating centre',
      });
      return;
    }

    const users = await User.find(userFilter)
      .select('-__v -createdAt -updatedAt -isDeleted -deletedAt -deletedBy')
      .lean()
      .exec();

    if (!users || users.length === 0) {
      res.status(404).json({
        code: 'NotFound',
        message: 'No users found for this collaborating centre',
      });
      return;
    }

    res.status(200).json({
      users,
      total: users.length,
      filter: {
        role: currentUser.role,
        access: currentUser.access,
        collaboratingCentreId: currentUser.collaboratingCentreId,
        requestedCentreId: collaboratingCentreId,
        canAccessAnyCentre:
          (currentUser.role === 'superadmin' && currentUser.access === 'all') ||
          (currentUser.role === 'admin' && currentUser.access === 'all'),
        centreRestricted:
          currentUser.role === 'admin' && currentUser.access === 'centre',
        appliedFilter: userFilter,
      },
    });

    ControllerLogger.logSuccess(req, 'Get Users By Collaborating Centre', 'baseline', {
    userId: req.userId?.toString() ,
    
        requestedBy: currentUser.role,
        requestedByAccess: currentUser.access,
        requestedByUserId: currentUserId,
        requestedByEmail: currentUser.email,
        collaboratingCentreId,
        userCount: users.length,
        canAccessAnyCentre:
          (currentUser.role === 'superadmin' && currentUser.access === 'all') ||
          (currentUser.role === 'admin' && currentUser.access === 'all'),
        centreRestricted:
          currentUser.role === 'admin' && currentUser.access === 'centre',
        appliedFilter: userFilter
      
  });
  } catch (err) {
    ControllerLogger.logError(req, 'Get Users By Collaborating Centre', 'user', err, {
      userId: req.userId?.toString(),
      collaboratingCentreId: req.params.collaboratingCentreId
    });

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
      error: err,
    });
  }
};

export default getUserByCollaboratingCentre;
