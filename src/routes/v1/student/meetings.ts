import { Router } from 'express';
import { param } from 'express-validator';
import authenticateStudent from '@/middlewares/authenticateStudent';
import validationError from '@/middlewares/validationError';
import {
  getStudentMeetings,
  getStudentMeetingById,
} from '@/controllers/v1/student/meeting';

const router = Router();

// All routes require student authentication
router.use(authenticateStudent);

// Get all meetings for the logged-in student (filtered by their class and section)
router.get('/', getStudentMeetings);

// Get meeting by ID
router.get(
  '/:id',
  param('id').isMongoId().withMessage('Invalid meeting ID'),
  validationError,
  getStudentMeetingById,
);

export default router;

