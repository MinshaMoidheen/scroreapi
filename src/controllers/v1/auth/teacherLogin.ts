import { generateAccessToken, generateRefreshToken } from '@/lib/jwt';
import { logger } from '@/lib/manualLogger';
import config from '@/config';
import User from '@/models/user';
import Token from '@/models/token';
import type { Request, Response } from 'express';
import type { IUser } from '@/models/user';

type TeacherLoginBody = Pick<IUser, 'email' | 'password'> & {
  courseClassId?: string;
  sectionId?: string;
  subjectId?: string;
};

const teacherLogin = async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body as TeacherLoginBody;

  try {
    const user = await User.findOne({ email })
      .select('username email role password')
      .lean()
      .exec();

    if (!user) {
      res.status(404).json({
        code: 'Not Found',
        message: 'User not found',
      });
      return;
    }

    // Check if user has teacher role - only teachers can login via teacher login
    const userRole = user.role as string;
    if (userRole !== 'teacher') {
      res.status(403).json({
        code: 'AuthorizationError',
        message: 'Only users with teacher role can login here. Please use the appropriate login page.',
      });
      return;
    }

    // Generate access token and refresh token
    const accessToken = generateAccessToken(user._id);
    const refreshToken = generateRefreshToken(user._id);

    // Store refresh token in database
    await Token.create({
      userId: user._id,
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
        username: user.username,
        email: user.email,
        role: user.role,
        access: user.access,
        collaboratingCentreId: user.collaboratingCentreId,
      },
      accessToken,
    });

    // Log successful login
    await logger.logLogin(user._id, req);
  } catch (err) {
    // Log the error
    await logger.logError('AUTH', 'TEACHER_LOGIN', err, 'anonymous', req, {
      email: email,
    });

    res.status(500).json({
      code: 'Server Error',
      message: 'Internal server error',
    });
  }
};

export default teacherLogin;

