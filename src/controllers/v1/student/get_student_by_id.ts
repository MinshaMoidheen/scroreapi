import { logger } from '@/lib/manualLogger';
import Student from '@/models/student';
import type { Request, Response } from 'express';

const getStudentById = async (req: Request, res: Response): Promise<void> => {
  const currentUserId = req.userId?.toString() || '';
  const studentId = req.params.studentId;

  try {
    const student = await Student.findOne({
      _id: studentId,
      'isDeleted.status': { $ne: true },
    })
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .select('-password -__v -isDeleted')
      .lean();

    if (!student) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Student not found',
      });
      return;
    }

    res.status(200).json({
      student,
    });
  } catch (err) {
    await logger.logError('STUDENT', 'GET_BY_ID', err, currentUserId, req);

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
    });
  }
};

export default getStudentById;

