import Meeting from '@/models/meeting';
import Student from '@/models/student';
import { Request, Response } from 'express';
import { Types } from 'mongoose';

/**
 * Get meetings for a student based on their class and section
 */
export const getStudentMeetings = async (req: Request, res: Response): Promise<void> => {
  try {
    const studentId = req.studentId || req.userId;

    if (!studentId) {
      res.status(401).json({
        code: 'AuthenticationError',
        message: 'Student not authenticated',
      });
      return;
    }

    // Get student details
    // Don't populate here - we need the raw ObjectIds for filtering
    const student = await Student.findById(studentId)
      .select('courseClass section')
      .lean()
      .exec();

    if (!student) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Student not found',
      });
      return;
    }

    // Build filter based on student's class and section
    const filter: any = {
      'isDeleted.status': { $ne: true },
    };

    // Handle courseClass - it might be an ObjectId or already a string
    if (student.courseClass) {
      let courseClassId: Types.ObjectId;
      if (student.courseClass instanceof Types.ObjectId) {
        courseClassId = student.courseClass;
      } else if (typeof student.courseClass === 'object' && student.courseClass !== null && '_id' in student.courseClass) {
        courseClassId = new Types.ObjectId((student.courseClass as any)._id.toString());
      } else {
        courseClassId = new Types.ObjectId(String(student.courseClass));
      }
      filter.courseClass = courseClassId;
    }
    
    // Handle section - it might be an ObjectId or already a string
    if (student.section) {
      let sectionId: Types.ObjectId;
      if (student.section instanceof Types.ObjectId) {
        sectionId = student.section;
      } else if (typeof student.section === 'object' && student.section !== null && '_id' in student.section) {
        sectionId = new Types.ObjectId((student.section as any)._id.toString());
      } else {
        sectionId = new Types.ObjectId(String(student.section));
      }
      filter.section = sectionId;
    }

    const meetings = await Meeting.find(filter)
      .populate({
        path: 'organizer',
        select: 'username email',
      })
      .populate({
        path: 'participants',
        select: 'username email',
      })
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .populate('subject', 'name')
      .sort({ date: -1, startTime: -1 });

    res.status(200).json(meetings);
  } catch (err) {
    res.status(500).json({
      code: 'ServerError',
      message: 'Error while getting student meetings',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    console.error('Error while getting student meetings', err);
  }
};

/**
 * Get meeting by ID for a student
 */
export const getStudentMeetingById = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const studentId = req.studentId || req.userId;

    if (!studentId) {
      res.status(401).json({
        code: 'AuthenticationError',
        message: 'Student not authenticated',
      });
      return;
    }

    // Get student details
    const student = await Student.findById(studentId)
      .select('courseClass section')
      .lean()
      .exec();

    if (!student) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Student not found',
      });
      return;
    }

    const meeting = await Meeting.findOne({
      _id: id,
      'isDeleted.status': { $ne: true },
    })
      .populate({
        path: 'organizer',
        select: 'username email',
      })
      .populate({
        path: 'participants',
        select: 'username email',
      })
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .populate('subject', 'name');

    if (!meeting) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Meeting not found',
      });
      return;
    }

    // Verify meeting belongs to student's class and section
    // Handle both ObjectId and populated object cases
    const getObjectIdString = (value: any): string | null => {
      if (!value) return null;
      if (value instanceof Types.ObjectId) return value.toString();
      if (typeof value === 'object' && value !== null && '_id' in value) {
        return (value as any)._id.toString();
      }
      return String(value);
    };
    
    const meetingClass = getObjectIdString(meeting.courseClass);
    const meetingSection = getObjectIdString(meeting.section);
    const studentClass = getObjectIdString(student.courseClass);
    const studentSection = getObjectIdString(student.section);

    if (meetingClass !== studentClass || meetingSection !== studentSection) {
      res.status(403).json({
        code: 'Forbidden',
        message: 'You do not have access to this meeting',
      });
      return;
    }

    res.status(200).json(meeting);
  } catch (err) {
    res.status(500).json({
      code: 'ServerError',
      message: 'Error while getting meeting',
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    console.error('Error while getting student meeting by id', err);
  }
};

