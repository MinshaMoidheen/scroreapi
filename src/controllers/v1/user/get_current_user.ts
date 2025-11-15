import { logger } from '@\/lib\/manualLogger';
import ControllerLogger from '@/utils/controllerLogger';

import User from '@/models/user';
import Student from '@/models/student';

import type { Request, Response } from 'express';

const getCurrentUser = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  ControllerLogger.logStart(req, 'Get Current User', 'user', {
    userId: req.userId?.toString()
  });

  try {
    const userId = req.userId;
    
    // First, try to find in User collection
    let user = await User.findOne({ _id: userId, 'isDeleted.status': { $ne: true } })
      .select('-__v -password -isDeleted -createdAt -updatedAt')
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .populate('subject', 'name')
      .lean()
      .exec();

    // If not found in User collection, check Student collection
    if (!user) {
      const student = await Student.findOne({ _id: userId, 'isDeleted.status': { $ne: true } })
        .select('-__v -password -isDeleted -createdAt -updatedAt')
        .populate('courseClass', 'name')
        .populate('section', 'name')
        .lean()
        .exec();

      if (student) {
        // Transform student to match user format
        user = {
          ...student,
          role: 'student',
          email: undefined, // Students don't have email
        } as any;
      }
    }

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
      userEmail: (user as any).email || 'N/A',
      userRole: (user as any).role || 'student'
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
