import { logger } from '@/lib/manualLogger';

import User from '@/models/user';

import type { Request, Response, NextFunction } from 'express';

export type AuthRole = 'admin' | 'user' | 'superadmin';

const authorize = (roles: AuthRole[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const userId = req.userId;

    try {
      const user = await User.findById(userId).select('role access').exec();

      if (!user) {
        res.status(404).json({
          code: 'NotFound',
          message: 'User not found',
        });
        return;
      }

      if (!roles.includes(user.role)) {
        res.status(403).json({
          code: 'AuthorizationError',
          message: 'Access denied, insufficient permissions',
        });
        return;
      }

      // Validate access level based on role
      if (user.role === 'superadmin') {
        if (user.access !== 'all') {
          res.status(403).json({
            code: 'AuthorizationError',
            message: 'Superadmin role must have "all" access',
          });
          return;
        }
      } else if (user.role === 'admin') {
        if (user.access !== 'all' && user.access !== 'centre') {
          res.status(403).json({
            code: 'AuthorizationError',
            message: 'Admin role can only have "all" or "centre" access',
          });
          return;
        }
      } else if (user.role === 'user') {
        if (
          user.access !== 'all' &&
          user.access !== 'centre' &&
          user.access !== 'own'
        ) {
          res.status(403).json({
            code: 'AuthorizationError',
            message: 'User role can only have "all", "centre", or "own" access',
          });
          return;
        }
      }

      return next();
    } catch (err) {
      res.status(500).json({
        code: 'ServerError',
        message: 'Internal server error',
        error: err,
      });
      logger.error('Error while authorizing user', err);
    }
  };
};

export const checkFolderAccess = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const folderId = req.params.id || req.body.folder;
    const userId = req.userId;
    if (!folderId) {
      return res.status(400).json({ error: 'Folder id is required' });
    }
    const Folder = await import('@/models/folder').then((m) => m.default || m);
    const folder = await Folder.findById(folderId).exec();
    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    if (
      folder.allowedUsers &&
      folder.allowedUsers.length > 0 &&
      !folder.allowedUsers.some((id: any) => id.equals(userId))
    ) {
      return res
        .status(403)
        .json({ error: 'You do not have access to this folder' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', details: err });
  }
};

export const checkFileAccess = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const fileId = req.params.id || req.body.file;
    const userId = req.userId;
    if (!fileId) {
      return res.status(400).json({ error: 'File id is required' });
    }
    const File = await import('@/models/file').then((m) => m.default || m);
    const file = await File.findById(fileId).exec();
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    if (
      file.allowedUsers &&
      file.allowedUsers.length > 0 &&
      !file.allowedUsers.some((id: any) => id.equals(userId))
    ) {
      return res
        .status(403)
        .json({ error: 'You do not have access to this file' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error', details: err });
  }
};

export default authorize;
