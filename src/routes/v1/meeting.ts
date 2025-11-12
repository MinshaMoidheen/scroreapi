import { Router } from 'express';
import { body, param } from 'express-validator';
import authenticate from '@/middlewares/authenticate';
import validationError from '@/middlewares/validationError';
import {
  createMeeting,
  getMeetings,
  getMeetingById,
  updateMeeting,
  deleteMeeting,
  getMyMeetings,
} from '../../controllers/v1/meeting/meeting';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Create meeting
router.post(
  '/',
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Title is required')
    .isLength({ max: 200 })
    .withMessage('Title must be less than 200 characters'),
  body('date')
    .notEmpty()
    .withMessage('Date is required')
    .isISO8601()
    .withMessage('Date must be a valid ISO 8601 date'),
  body('startTime')
    .notEmpty()
    .withMessage('Start time is required')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Start time must be in HH:MM format'),
  body('endTime')
    .notEmpty()
    .withMessage('End time is required')
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('End time must be in HH:MM format'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('courseClass')
    .optional()
    .isMongoId()
    .withMessage('Course class must be a valid MongoDB ID'),
  body('section')
    .optional()
    .isMongoId()
    .withMessage('Section must be a valid MongoDB ID'),
  body('subject')
    .optional()
    .isMongoId()
    .withMessage('Subject must be a valid MongoDB ID'),
  body('participants')
    .optional()
    .isArray()
    .withMessage('Participants must be an array'),
  validationError,
  createMeeting,
);

// Get all meetings
router.get('/', getMeetings);

// Get my meetings (filtered by organizer email and optionally by class/section/subject)
router.get('/my-meetings', getMyMeetings);

// Get meeting by ID
router.get(
  '/:id',
  param('id').isMongoId().withMessage('Invalid meeting ID'),
  validationError,
  getMeetingById,
);

// Update meeting
router.patch(
  '/:id',
  param('id').isMongoId().withMessage('Invalid meeting ID'),
  body('title')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Title must be less than 200 characters'),
  body('date')
    .optional()
    .isISO8601()
    .withMessage('Date must be a valid ISO 8601 date'),
  body('startTime')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Start time must be in HH:MM format'),
  body('endTime')
    .optional()
    .matches(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('End time must be in HH:MM format'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description must be less than 1000 characters'),
  body('courseClass')
    .optional()
    .isMongoId()
    .withMessage('Course class must be a valid MongoDB ID'),
  body('section')
    .optional()
    .isMongoId()
    .withMessage('Section must be a valid MongoDB ID'),
  body('subject')
    .optional()
    .isMongoId()
    .withMessage('Subject must be a valid MongoDB ID'),
  body('participants')
    .optional()
    .isArray()
    .withMessage('Participants must be an array'),
  validationError,
  updateMeeting,
);

// Delete meeting
router.delete(
  '/:id',
  param('id').isMongoId().withMessage('Invalid meeting ID'),
  validationError,
  deleteMeeting,
);

export default router;

