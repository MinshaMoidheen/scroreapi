import { Router } from 'express';
import { body, param, query } from 'express-validator';

import authenticate from '@/middlewares/authenticate';
import validationError from '@/middlewares/validationError';
import authorize from '@/middlewares/authorize';

import User from '@/models/user';
import getCurrentUser from '@/controllers/v1/user/get_current_user';
import deleteUser from '@/controllers/v1/user/delete_user';
import getAllUser from '@/controllers/v1/user/get_all_user';
import createUser from '@/controllers/v1/user/create_user';
import updateUser from '@/controllers/v1/user/update_user';
import getUserById from '@/controllers/v1/user/get_user_by_id';

const router = Router();

router.post(
  '/',
  authenticate,
  authorize(['admin', 'superadmin']),
  body('email')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isLength({ max: 50 })
    .withMessage('Email must be less than 50 characters')
    .custom(async (value) => {
      const userExists = await User.exists({ email: value, 'isDeleted.status': { $ne: true } });
      if (userExists) {
        throw new Error('User email or password is invalid');
      }
    }),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('username')
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3 })
    .withMessage('Username must be at least 3 characters long')
    .isLength({ max: 20 })
    .withMessage('Username must be less than 20 characters long'),
  body('role')
    .optional()
    .isIn(['admin', 'user', 'teacher'])
    .withMessage('Role must be either admin, user, or teacher'),
  body('access')
    .optional()
    .isIn(['centre', 'own', 'all'])
    .withMessage('Invalid access level')
    .custom((access, { req }) => {
      const role = req.body.role || 'user'; // default role is user
      if (role === 'admin' && access === 'own') {
        throw new Error(
          'Admin users cannot have own access - only centre or all access',
        );
      }
      return true;
    }),
  validationError,
  createUser,
);

router.get(
  '/current',
  authenticate,
  authorize(['admin', 'user', 'superadmin', 'teacher']),
  getCurrentUser,
);

router.put(
  '/:userId',
  authenticate,
  authorize(['admin', 'superadmin']),
  param('userId').notEmpty().isMongoId().withMessage('Invalid user ID'),
  body('username')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Username must be less than 20 characters'),
  body('email')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Email must be less than 50 characters')
    .isEmail()
    .withMessage('Invalid email address')
    .custom(async (value, { req }) => {
      if (!value) return true; // Skip validation if no value provided

      const userExists = await User.exists({
        email: value,
        _id: { $ne: req.params?.userId }, // Exclude current user
        'isDeleted.status': { $ne: true },
      });
      if (userExists) {
        throw new Error('This email is already in use');
      }
      return true;
    }),
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('access')
    .optional()
    .isIn(['centre', 'own', 'all'])
    .withMessage('Invalid access level')
    .custom(async (access, { req }) => {
      // Get the target user to check their role
      const targetUserId = req.params?.userId;
      if (targetUserId) {
        const targetUser = await User.findOne({
          _id: targetUserId,
          'isDeleted.status': { $ne: true },
        })
          .select('role')
          .lean();

        if (targetUser) {
          if (targetUser.role === 'admin' && access === 'own') {
            throw new Error(
              'Admin users cannot have "own" access - only "centre" or "all" access',
            );
          }
        }
      }
      return true;
    }),
  validationError,
  updateUser,
);

router.delete(
  '/:userId',
  authenticate,
  authorize(['admin', 'superadmin']),
  deleteUser,
);

router.get(
  '/',
  authenticate,
  authorize(['superadmin', 'admin']),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a positive integer'),
  validationError,
  getAllUser,
);

router.get(
  '/:userId',
  authenticate,
  authorize(['admin', 'superadmin']),
  param('userId').notEmpty().isMongoId().withMessage('Invalid user ID'),
  validationError,
  getUserById,
);

export default router;
