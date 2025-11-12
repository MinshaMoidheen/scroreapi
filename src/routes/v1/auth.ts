import { Router } from 'express';
import { body, cookie } from 'express-validator';
import bcrypt from 'bcrypt';

import login from '@/controllers/v1/auth/login';
import refreshToken from '@/controllers/v1/auth/refresh_token';
import logout, { logoutUser } from '@/controllers/v1/auth/logout';

import User from '@/models/user';

import validationError from '@/middlewares/validationError';
import authenticate from '@/middlewares/authenticate';
import authorize from '@/middlewares/authorize';

const router = Router();

router.post(
  '/login',
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .custom(async (value, { req }) => {
      const { email } = req.body as { email: string };
      const user = await User.findOne({ email })
        .select('password')
        .lean()
        .exec();

      if (!user) {
        throw new Error('User email or password is invalid');
      }

      const passwordMatch = await bcrypt.compare(value, user.password);
      if (!passwordMatch) {
        throw new Error('User email or password is invalid');
      }
    }),
  validationError,
  login,
);

router.post(
  '/refresh-token',
  cookie('refreshToken')
    .notEmpty()
    .withMessage('Refresh token required')
    .isJWT()
    .withMessage('Invalid refresh token'),
  validationError,
  refreshToken,
);

// Self logout
router.post('/logout', authenticate, logout);

// Logout other users (admin/superadmin only)
router.post(
  '/logout/:userId',
  authenticate,
  authorize(['admin', 'superadmin']),
  logoutUser,
);

export default router;
