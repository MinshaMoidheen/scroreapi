import { logger } from '@/lib/manualLogger';
import Student from '@/models/student';
import CourseClass from '@/models/courseClass';
import Section from '@/models/section';
import type { Request, Response } from 'express';
import type { IStudent } from '@/models/student';

type CreateStudentRequestBody = Pick<
  IStudent,
  'username' | 'password' | 'courseClass' | 'section' | 'rollNumber'
>;

const createStudent = async (req: Request, res: Response): Promise<void> => {
  const currentUserId = req.userId?.toString() || '';
  const { username, password, courseClass, section, rollNumber } =
    req.body as CreateStudentRequestBody;

  try {
    // Validate course class exists
    const courseClassExists = await CourseClass.findOne({
      _id: courseClass,
      'isDeleted.status': { $ne: true },
    }).lean();

    if (!courseClassExists) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Course class not found',
      });
      return;
    }

    // Validate section exists and belongs to the course class
    const sectionExists = await Section.findOne({
      _id: section,
      courseClass: courseClass,
      'isDeleted.status': { $ne: true },
    }).lean();

    if (!sectionExists) {
      res.status(404).json({
        code: 'NotFound',
        message: 'Section not found or does not belong to the selected course class',
      });
      return;
    }

    // Check if roll number already exists in this section
    const existingStudent = await Student.findOne({
      rollNumber,
      section,
      'isDeleted.status': { $ne: true },
    }).lean();

    if (existingStudent) {
      res.status(400).json({
        code: 'BadRequest',
        message: 'Roll number already exists in this section',
      });
      return;
    }

    // Create new student
    const newStudent = await Student.create({
      username,
      password,
      courseClass,
      section,
      rollNumber,
    });

    // Populate references
    const populatedStudent = await Student.findById(newStudent._id)
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .select('-password -__v -isDeleted')
      .lean();

    // Return success response
    res.status(201).json({
      message: 'Student created successfully',
      student: populatedStudent,
    });

    // Log the creation activity
    await logger.logCreate(
      'STUDENT',
      newStudent._id,
      newStudent.toObject(),
      currentUserId,
      req
    );
  } catch (err: any) {
    // Log the error
    if (currentUserId) {
      await logger.logError(
        'STUDENT',
        'CREATE',
        err,
        currentUserId,
        req,
        {
          username,
          courseClass,
          section,
          rollNumber,
        }
      );
    }

    // Handle duplicate key error (roll number)
    if (err.code === 11000) {
      res.status(400).json({
        code: 'BadRequest',
        message: 'Roll number already exists in this section',
      });
      return;
    }

    res.status(500).json({
      code: 'ServerError',
      message: 'Internal server error',
    });
  }
};

export default createStudent;

