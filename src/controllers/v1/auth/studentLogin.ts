import { generateAccessToken, generateRefreshToken } from '@/lib/jwt';
import { logger } from '@/lib/manualLogger';
import config from '@/config';
import Student from '@/models/student';
import Token from '@/models/token';
import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';

type StudentLoginBody = {
  username: string;
  password: string;
  courseClass: string;
  section: string;
  rollNumber: string;
};

const studentLogin = async (req: Request, res: Response): Promise<void> => {
  const { username, password, courseClass, section, rollNumber } = req.body as StudentLoginBody;

  try {
    // Find student by username, courseClass, section, and rollNumber
    // Include password for verification
    const student = await Student.findOne({
      username,
      courseClass,
      section,
      rollNumber,
      'isDeleted.status': { $ne: true },
    })
      .select('username password courseClass section rollNumber')
      .lean()
      .exec();

    if (!student) {
      res.status(404).json({
        code: 'Not Found',
        message: 'Student not found. Please check your credentials.',
      });
      return;
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, student.password);
    if (!passwordMatch) {
      res.status(401).json({
        code: 'AuthenticationError',
        message: 'Invalid username, class, section, roll number, or password',
      });
      return;
    }

    // Get populated student data for response
    const populatedStudent = await Student.findById(student._id)
      .populate('courseClass', 'name')
      .populate('section', 'name')
      .select('-password -__v -isDeleted')
      .lean()
      .exec();

    if (!populatedStudent) {
      res.status(404).json({
        code: 'Not Found',
        message: 'Student not found',
      });
      return;
    }

    // Generate access token and refresh token with student type
    const accessToken = generateAccessToken(student._id, 'student');
    const refreshToken = generateRefreshToken(student._id, 'student');

    // Store refresh token in database
    await Token.create({
      userId: student._id,
      token: refreshToken,
    });

    // Set refresh token cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
    });

    // Send successful response
    res.status(201).json({
      user: {
        id: populatedStudent._id,
        username: populatedStudent.username,
        rollNumber: populatedStudent.rollNumber,
        courseClass: typeof populatedStudent.courseClass === 'object' 
          ? populatedStudent.courseClass 
          : { _id: populatedStudent.courseClass, name: '' },
        section: typeof populatedStudent.section === 'object' 
          ? populatedStudent.section 
          : { _id: populatedStudent.section, name: '' },
        role: 'student',
      },
      accessToken,
    });

    // Log successful login
    await logger.logLogin(student._id, req);
  } catch (err) {
    // Log the error
    await logger.logError('AUTH', 'STUDENT_LOGIN', err, 'anonymous', req, {
      username,
    });

    res.status(500).json({
      code: 'Server Error',
      message: 'Internal server error',
    });
  }
};

export default studentLogin;

