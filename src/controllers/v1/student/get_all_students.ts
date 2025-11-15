import config from '@/config';
import { logger } from '@/lib/manualLogger';
import ControllerLogger from '@/utils/controllerLogger';
import Student from '@/models/student';
import type { Request, Response } from 'express';

const getAllStudents = async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  ControllerLogger.logStart(req, 'Get All Students', 'baseline', {
    userId: req.userId?.toString(),
  });

  try {
    const currentUserId = req.userId?.toString() || '';
    const limit = parseInt(req.query.limit as string) || config.defaultResLimit;
    const offset = parseInt(req.query.offset as string) || config.defaultResOffset;
    const courseClassId = req.query.courseClass as string;
    const sectionId = req.query.section as string;

    // Build filter
    let queryFilter: any = {
      'isDeleted.status': { $ne: true },
    };

    if (courseClassId) {
      queryFilter.courseClass = courseClassId;
    }

    if (sectionId) {
      queryFilter.section = sectionId;
    }

    // Get students with pagination
    const students = await Student.find(queryFilter)
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .select('-password -__v -isDeleted')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean();

    // Get total count
    const total = await Student.countDocuments(queryFilter);

    const endTime = Date.now();
    ControllerLogger.logSuccess(req, 'Get All Students', 'baseline', {
      userId: currentUserId,
      duration: endTime - startTime,
    });

    res.status(200).json({
      students,
      total,
      limit,
      offset,
    });
  } catch (err) {
    const currentUserId = req.userId?.toString() || '';
    await logger.logError('STUDENT', 'GET_ALL', err, currentUserId, req);

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
    });
  }
};

export default getAllStudents;

