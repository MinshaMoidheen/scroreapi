import { logger } from '@/lib/manualLogger';
import Student from '@/models/student';
import User from '@/models/user';
import type { Request, Response } from 'express';

const deleteStudent = async (req: Request, res: Response): Promise<void> => {
  const currentUserId = req.userId?.toString() || '';
  const studentId = req.params.studentId;

  try {
    // Find the student
    const student = await Student.findOne({
      _id: studentId,
      'isDeleted.status': { $ne: true },
    });

    if (!student) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Student not found',
      });
      return;
    }

    // Get current user for soft delete
    const currentUser = await User.findById(currentUserId).select('_id').lean();

    if (!currentUser) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Current user not found',
      });
      return;
    }

    // Store student data for logging before deletion
    const studentData = student.toObject();

    // Soft delete
    student.isDeleted = {
      deletedBy: currentUser._id,
      deletedTime: new Date(),
      status: true,
    };

    await student.save();

    res.status(200).json({
      message: 'Student deleted successfully',
    });

    // Log the deletion activity
    await logger.logDelete('STUDENT', studentId, studentData, currentUserId, req);
  } catch (err) {
    await logger.logError('STUDENT', 'DELETE', err, currentUserId, req);

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
    });
  }
};

export default deleteStudent;

