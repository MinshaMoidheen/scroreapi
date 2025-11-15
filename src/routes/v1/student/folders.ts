import { Router } from 'express';
import { param } from 'express-validator';
import authenticateStudent from '@/middlewares/authenticateStudent';
import validationError from '@/middlewares/validationError';
import {
  getStudentFolders,
  getStudentSubfolders,
  getStudentFolderById,
} from '@/controllers/v1/student/folder';

const router = Router();

// All routes require student authentication
router.use(authenticateStudent);

// Get all folders for the logged-in student (filtered by their class and section)
router.get('/', getStudentFolders);

// Get subfolders for a specific parent folder
router.get(
  '/subfolders/:parentId',
  param('parentId').isMongoId().withMessage('Invalid parent folder ID'),
  validationError,
  getStudentSubfolders,
);

// Get folder by ID
router.get(
  '/:id',
  param('id').isMongoId().withMessage('Invalid folder ID'),
  validationError,
  getStudentFolderById,
);

export default router;

