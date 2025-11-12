import { logger } from '@\/lib\/manualLogger';
import ControllerLogger from '@/utils/controllerLogger';

import User from '@/models/user';

import type { Request, Response } from 'express';

const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  ControllerLogger.logStart(req, 'Get Current User', 'user', {
    userId: req.userId?.toString()
  });

  try {
    const userId = req.userId;
    const user = await User.findOne({ _id: userId, 'isDeleted.status': { $ne: true } })
      .select('-__v -password -isDeleted -createdAt -updatedAt')
      .lean()
      .exec();

    if (!user) {
      res.status(404).json({
        code: 'NotFound',
        message: 'User not found',
      });
      return;
    }

    res.status(200).json({
      user,
    });

    ControllerLogger.logSuccess(req, 'Get Current User', 'user', {
      userId: req.userId?.toString(),
      userEmail: user.email,
      userRole: user.role
    });
  } catch (err) {
    ControllerLogger.logError(req, 'Get Current User', 'user', err, {
      userId: req.userId?.toString()
    });

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
      error: err,
    });
  }
};

export default getCurrentUser;
