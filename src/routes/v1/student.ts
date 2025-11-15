import { Router } from 'express';
import { body, param, query } from 'express-validator';

import authenticate from '@/middlewares/authenticate';
import validationError from '@/middlewares/validationError';
import authorize from '@/middlewares/authorize';

import Student from '@/models/student';
import createStudent from '@/controllers/v1/student/create_student';
import getAllStudents from '@/controllers/v1/student/get_all_students';
import getStudentById from '@/controllers/v1/student/get_student_by_id';
import updateStudent from '@/controllers/v1/student/update_student';
import deleteStudent from '@/controllers/v1/student/delete_student';

// Student-specific routes
import studentFolderRoutes from './student/folders';
import studentMeetingRoutes from './student/meetings';

const router = Router();

// Student-specific routes (for logged-in students)
// These routes use authenticateStudent middleware (NO authorize middleware)
// IMPORTANT: Mount these routes BEFORE parameterized routes to avoid route conflicts
router.use('/folders', studentFolderRoutes);
router.use('/meetings', studentMeetingRoutes);

// Create student
router.post(
  '/',
  authenticate,
  authorize(['admin', 'superadmin']),
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ max: 50 })
    .withMessage('Username must be less than 50 characters'),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('courseClass')
    .notEmpty()
    .withMessage('Course class is required')
    .isMongoId()
    .withMessage('Invalid course class ID'),
  body('section')
    .notEmpty()
    .withMessage('Section is required')
    .isMongoId()
    .withMessage('Invalid section ID'),
  body('rollNumber')
    .trim()
    .notEmpty()
    .withMessage('Roll number is required')
    .isLength({ max: 20 })
    .withMessage('Roll number must be less than 20 characters'),
  validationError,
  createStudent,
);

// Get all students
router.get(
  '/',
  authenticate,
  authorize(['admin', 'superadmin']),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('offset')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Offset must be a positive integer'),
  query('courseClass')
    .optional()
    .isMongoId()
    .withMessage('Invalid course class ID'),
  query('section')
    .optional()
    .isMongoId()
    .withMessage('Invalid section ID'),
  validationError,
  getAllStudents,
);

// Get student by ID
router.get(
  '/:studentId',
  authenticate,
  authorize(['admin', 'superadmin']),
  param('studentId').notEmpty().isMongoId().withMessage('Invalid student ID'),
  validationError,
  getStudentById,
);

// Update student
router.put(
  '/:studentId',
  authenticate,
  authorize(['admin', 'superadmin']),
  param('studentId').notEmpty().isMongoId().withMessage('Invalid student ID'),
  body('username')
    .optional()
    .trim()
    .isLength({ max: 50 })
    .withMessage('Username must be less than 50 characters'),
  body('password')
    .optional()
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long'),
  body('courseClass')
    .optional()
    .isMongoId()
    .withMessage('Invalid course class ID'),
  body('section')
    .optional()
    .isMongoId()
    .withMessage('Invalid section ID'),
  body('rollNumber')
    .optional()
    .trim()
    .isLength({ max: 20 })
    .withMessage('Roll number must be less than 20 characters'),
  validationError,
  updateStudent,
);

// Delete student
router.delete(
  '/:studentId',
  authenticate,
  authorize(['admin', 'superadmin']),
  param('studentId').notEmpty().isMongoId().withMessage('Invalid student ID'),
  validationError,
  deleteStudent,
);

export default router;

