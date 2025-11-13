import { logger } from '@/lib/manualLogger';
import User from '@/models/user';

import type { Request, Response } from 'express';
import type { IUser } from '@/models/user';

type CreateUserRequestBody = Pick<
  IUser,
  | 'email'
  | 'password'
  | 'username'
  | 'collaboratingCentreId'
  | 'role'
  | 'access'
>;

const createUser = async (req: Request, res: Response): Promise<void> => {
  const currentUserId = req.userId?.toString() || '';
  const { email, password, username, collaboratingCentreId, role, access } =
    req.body as CreateUserRequestBody;

  try {
    // Get current user
    const currentUser = await User.findById(req.userId)
      .select('-__v -password -isDeleted -createdAt -updatedAt')
      .lean()
      .exec();

    if (!currentUser) {
      // Log the error
      if (currentUserId) {
        await logger.logError(
          'USER',
          'CREATE',
          'Current user not found',
          currentUserId,
          req
        );
      }
      res.status(404).json({
        code: 'NotFound',
        message: 'Current user not found',
      });
      return;
    }

   

    let newUser: any;

    if (currentUser.role === 'superadmin') {
      // Superadmin can create admin, user, and teacher roles
      if (role && role !== 'admin' && role !== 'user' && role !== 'teacher') {
        // Log the error
        if (currentUserId) {
          await logger.logError(
            'USER',
            'CREATE',
            `Superadmin attempted to create invalid role: ${role}`,
            currentUserId,
            req,
            { role }
          );
        }
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Superadmin can only create admin, user, or teacher roles',
        });
        return;
      }

      // if (!collaboratingCentreId) {
      //   res.status(400).json({
      //     code: 'BadRequest',
      //     message: 'Collaborating centre ID is required',
      //   });
      //   return;
      // }

      // Set default access if not provided
      const finalAccess = access || 'centre';

      newUser = await User.create({
        username,
        email,
        password,
        role,
        // collaboratingCentreId,
        access: finalAccess,
      });
    } else if (currentUser.role === 'admin') {
      // Admin can create users with 'user' or 'teacher' role
      if (role && role !== 'user' && role !== 'teacher') {
        // Log the error
        if (currentUserId) {
          await logger.logError(
            'USER',
            'CREATE',
            `Admin attempted to create invalid account: ${role}`,
            currentUserId,
            req,
            { role }
          );
        }
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Admin users can only create user or teacher accounts',
        });
        return;
      }

      // Check admin's access level to determine allowed operations
      let targetCollaboratingCentreId: string;

      if (currentUser.role === 'admin' && currentUser.access === 'all') {
        // Admin with 'all' access can create users in any collaborating centre
        // if (!collaboratingCentreId) {
        //   res.status(400).json({
        //     code: 'BadRequest',
        //     message:
        //       'Collaborating centre ID is required for admin with "all" access',
        //   });
        //   return;
        // }


        // targetCollaboratingCentreId = collaboratingCentreId?.toString();
      } else if (currentUser.role === 'admin' && currentUser.access === 'centre') {

        // if (!currentUser.collaboratingCentreId) {
        //   res.status(400).json({
        //     code: 'BadRequest',
        //     message: 'Admin user does not have a collaborating centre assigned',
        //   });
        //   return;
        // }

      } else {
        res.status(403).json({
          code: 'AccessDenied',
          message: 'Admin role can only have "all" or "centre" access',
        });
        return;
      }

      // Validate access level for user or teacher role
      const finalAccess = access || 'centre';
      const finalRole = role || 'user';

      newUser = await User.create({
        username,
        email,
        password,
        role: finalRole,
        access: finalAccess,
      });
    } else {
      res.status(403).json({
        code: 'AuthorizationError',
        message: 'Insufficient permissions to create users',
      });
      return;
    }

    // Return success response
    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: newUser._id,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        // collaboratingCentreId: newUser.collaboratingCentreId,
        access: newUser.access,
      },
    });

    // Log the creation activity
    await logger.logCreate(
      'USER',
      newUser._id,
      newUser.toObject(),
      currentUserId,
      req
    );
  } catch (err) {
    // Log the error
    if (currentUserId) {
      await logger.logError(
        'USER',
        'CREATE',
        err,
        currentUserId,
        req,
        {
          email,
          username,
          role,
          access,
          // collaboratingCentreId
        }
      );
    }

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
    });
  }
};

export default createUser;
