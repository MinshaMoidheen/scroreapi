import config from '@/config';
import { logger } from '@\/lib\/manualLogger';
import ControllerLogger from '@/utils/controllerLogger';

import User from '@/models/user';
import type { Request, Response } from 'express';

const getAllUser = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  ControllerLogger.logStart(req, 'Get All Users', 'baseline', {
    userId: req.userId?.toString() 
  });

  try {
    const currentUserId = req.userId?.toString() || '';
    const limit = parseInt(req.query.limit as string) || config.defaultResLimit;
    let offset =
      parseInt(req.query.offset as string) || config.defaultResOffset;

    // Get current user
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
    let queryFilter: any = {
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

      // Superadmin can see all admin, user, and teacher roles
      queryFilter = {
        ...queryFilter,
        role: { $in: ['admin', 'user', 'teacher'] },
      };
    } else if (currentUser.role === 'admin') {
      // Check admin's access level to determine allowed operations
      if (currentUser.access === 'all') {
        // Admin with 'all' access can see all users and teachers from any collaborating centre
        // but cannot see other admin users
        queryFilter = {
          ...queryFilter,
          role: { $in: ['user', 'teacher'] },
        };
      } else if (currentUser.access === 'centre') {
        // Admin with 'centre' access can only see users and teachers from their own collaborating centre
        if (!currentUser.collaboratingCentreId) {
          res.status(400).json({
            code: 'BadRequest',
            message: 'Admin user does not have a collaborating centre assigned',
          });
          return;
        }

        // Filter to only users with 'user' or 'teacher' role from same collaborating centre
        // Admin with 'centre' access cannot see other admin users
        queryFilter = {
          ...queryFilter,
          role: { $in: ['user', 'teacher'] },
          collaboratingCentreId: currentUser.collaboratingCentreId,
        };
      } else {
        res.status(403).json({
          code: 'AccessDenied',
          message: 'Admin role can only have "all" or "centre" access',
        });
        return;
      }
    } else {
      // Regular users cannot access user list
      res.status(403).json({
        code: 'AuthorizationError',
        message: 'Insufficient permissions to view users',
      });
      return;
    }

    const total = await User.countDocuments(queryFilter);

    if (offset >= total && total > 0) {
      offset = 0;
    }

    const users = await User.find(queryFilter)
      .select('-password -__v -isDeleted -deletedAt -deletedBy')
      .populate(
        'collaboratingCentreId',
        'collaboratingCentreName collaboratingCentreCode',
      )
      .limit(limit)
      .skip(offset)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const hasMore = offset + limit < total;
    const currentPage = Math.floor(offset / limit) + 1;
    const totalPages = Math.ceil(total / limit);

    res.status(200).json({
      message: 'Users retrieved successfully',
      users,
      total,
      limit,
      offset,
      pagination: {
        currentPage,
        totalPages,
        hasMore,
        totalItems: total,
      },
      filter: {
        role: currentUser.role,
        access: currentUser.access,
        collaboratingCentreId: currentUser.collaboratingCentreId,
        canSeeAll:
          (currentUser.role === 'superadmin' && currentUser.access === 'all') ||
          (currentUser.role === 'admin' && currentUser.access === 'all'),
        canSeeAdmins:
          currentUser.role === 'superadmin' && currentUser.access === 'all',
        centreRestricted:
          currentUser.role === 'admin' && currentUser.access === 'centre',
        appliedFilter: queryFilter,
      },
    });

    ControllerLogger.logSuccess(req, 'Get All Users', 'baseline', {
    userId: req.userId?.toString() ,
    
        totalUsers: total,
        currentPage,
        limit,
        offset,
        appliedFilter: queryFilter,
        requestedByRole: currentUser.role,
        requestedByAccess: currentUser.access
      
  });
  } catch (err) {
    ControllerLogger.logError(req, 'Get All Users', 'baseline', err, {
    userId: req.userId?.toString() 
  });

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
    });
  }
};

export default getAllUser;
