import { logger } from '@/lib/manualLogger';
import Student from '@/models/student';
import CourseClass from '@/models/courseClass';
import Section from '@/models/section';
import type { Request, Response } from 'express';

const updateStudent = async (req: Request, res: Response): Promise<void> => {
  const currentUserId = req.userId?.toString() || '';
  const studentId = req.params.studentId;
  const { username, password, courseClass, section, rollNumber } = req.body;

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

    // Validate course class if provided
    if (courseClass) {
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
    }

    // Validate section if provided
    if (section) {
      const finalCourseClass = courseClass || student.courseClass;
      const sectionExists = await Section.findOne({
        _id: section,
        courseClass: finalCourseClass,
        'isDeleted.status': { $ne: true },
      }).lean();

      if (!sectionExists) {
        res.status(404).json({
          code: 'NotFound',
          message: 'Section not found or does not belong to the selected course class',
        });
        return;
      }
    }

    // Check if roll number already exists in the section (if rollNumber or section changed)
    if (rollNumber || section) {
      const finalSection = section || student.section;
      const finalRollNumber = rollNumber || student.rollNumber;

      const existingStudent = await Student.findOne({
        rollNumber: finalRollNumber,
        section: finalSection,
        _id: { $ne: studentId },
        'isDeleted.status': { $ne: true },
      }).lean();

      if (existingStudent) {
        res.status(400).json({
          code: 'BadRequest',
          message: 'Roll number already exists in this section',
        });
        return;
      }
    }

    // Store old data for logging
    const oldStudentData = student.toObject();

    // Update student
    if (username) student.username = username;
    if (password) student.password = password;
    if (courseClass) student.courseClass = courseClass;
    if (section) student.section = section;
    if (rollNumber) student.rollNumber = rollNumber;

    await student.save();

    // Get updated student with populated fields
    const updatedStudent = await Student.findById(studentId)
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .select('-password -__v -isDeleted')
      .lean();

    res.status(200).json({
      message: 'Student updated successfully',
      student: updatedStudent,
    });

    // Log the update activity
    await logger.logUpdate(
      'STUDENT',
      studentId,
      oldStudentData,
      updatedStudent,
      currentUserId,
      Object.keys({ username, password, courseClass, section, rollNumber }).filter(key => req.body[key] !== undefined),
      req
    );
  } catch (err: any) {
    await logger.logError('STUDENT', 'UPDATE', err, currentUserId, req);

    // Handle duplicate key error
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

export default updateStudent;

